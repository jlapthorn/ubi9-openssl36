# ==========================================
# STAGE 1: Builder Stage
# ==========================================
FROM registry.access.redhat.com/ubi9/ubi:latest AS builder

# Install build dependencies
RUN dnf install -y \
    gcc \
    make \
    perl \
    perl-core \
    tar \
    gzip \
    && dnf clean all

WORKDIR /tmp

# Download OpenSSL source (Adjust tag/version as needed)
ARG OPENSSL_VERSION=3.6.0
RUN curl -LO https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz \
    && tar -xzf openssl-${OPENSSL_VERSION}.tar.gz

WORKDIR /tmp/openssl-${OPENSSL_VERSION}

# Configure build isolated in /opt/openssl36
# --prefix: Sets where OpenSSL installs itself
# --openssldir: Sets where configuration/certs reside
# rpath: Ensures the binary automatically finds its libraries in /opt/openssl36/lib64 without overriding global LD_LIBRARY_PATH
RUN ./config \
    --prefix=/opt/openssl36 \
    --openssldir=/opt/openssl36/ssl \
    '-Wl,-rpath,$(LIBRPATH)' \
    && make -j$(nproc) \
    && make install_sw

# ==========================================
# STAGE 2: Clean Final Runtime Image
# ==========================================
FROM registry.access.redhat.com/ubi9/ubi:latest

# Copy compiled OpenSSL installation from builder stage
COPY --from=builder /opt/openssl36 /opt/openssl36

# Create a symlink in a local bin path for convenience (does not overwrite system openssl)
RUN ln -s /opt/openssl36/bin/openssl /usr/local/bin/openssl36

# Default working directory
WORKDIR /app

# Set default command or entrypoint
CMD ["/opt/openssl36/bin/openssl", "version"]
