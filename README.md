# ubi9-openssl36

UBI 9 image with OpenSSL **3.6.0** installed under `/opt/openssl36`. The system OpenSSL is left alone; use `openssl36` (or `/opt/openssl36/bin/openssl`) for this build.

```bash
podman pull quay.io/jlapthor/ubi9-openssl36:latest
podman run --rm quay.io/jlapthor/ubi9-openssl36:latest
# OpenSSL 3.6.0 1 Oct 2025
```

Run CMS commands against files in the current directory:

```bash
podman run --rm -v "$PWD:/app:Z" -w /app \
  quay.io/jlapthor/ubi9-openssl36:latest \
  openssl36 version
```

The examples below use `openssl36`. If you already have a shell in the container, they work the same way.

This image was built with `make install_sw`, so it does not ship `/opt/openssl36/ssl/openssl.cnf`. Commands such as `req` need a config file; use the UBI system one:

```bash
export OPENSSL_CONF=/etc/pki/tls/openssl.cnf
```

OpenSSL 3.6 notes that matter for CMS:

- Default envelope cipher is **AES-256** (changed from 3DES in 3.5).
- RSA-PSS signing and RSA-OAEP encryption are supported via `-keyopt`.
- `-recip_kdf` and `-recip_ukm` were added in 3.6 for ECDH key agreement.

---

## CMS examples

[CMS](https://docs.openssl.org/3.6/man1/openssl-cms/) (Cryptographic Message Syntax, RFC 5652) is the format behind S/MIME: signed, encrypted, or signed-then-encrypted messages.

### 1. Create a demo CA and two people

Alice signs and decrypts. Bob is a second recipient.

```bash
# CA
openssl36 req -x509 -newkey rsa:2048 -keyout ca.key -out ca.crt \
  -days 365 -nodes -subj "/CN=Demo CMS CA"

# Alice
openssl36 req -new -newkey rsa:2048 -keyout alice.key -out alice.csr \
  -nodes -subj "/CN=Alice/emailAddress=alice@example.com" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=emailProtection" \
  -addext "subjectAltName=email:alice@example.com"
openssl36 x509 -req -in alice.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out alice.crt -days 365 -copy_extensions copyall

# Bob
openssl36 req -new -newkey rsa:2048 -keyout bob.key -out bob.csr \
  -nodes -subj "/CN=Bob/emailAddress=bob@example.com" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=emailProtection" \
  -addext "subjectAltName=email:bob@example.com"
openssl36 x509 -req -in bob.csr -CA ca.crt -CAkey ca.key \
  -out bob.crt -days 365 -copy_extensions copyall

printf 'Secret payload for CMS demo.\n' > message.txt
```

### 2. Sign (cleartext vs opaque)

Cleartext (`multipart/signed`): the original text stays readable, with a detached CMS signature beside it.

```bash
openssl36 cms -sign -in message.txt -text -out signed-clear.msg \
  -signer alice.crt -inkey alice.key
```

Opaque (`-nodetach`): content and signature are wrapped together. Recipients who cannot verify CMS see only binary.

```bash
openssl36 cms -sign -in message.txt -text -out signed-opaque.msg \
  -nodetach -signer alice.crt -inkey alice.key
```

RSA-PSS instead of PKCS#1 v1.5:

```bash
openssl36 cms -sign -in message.txt -text -out signed-pss.msg \
  -signer alice.crt -inkey alice.key \
  -keyopt rsa_padding_mode:pss
```

### 3. Verify a signed message

Point `-CAfile` at the CA that issued the signer cert. `-signer` writes out the signer certificate if verification succeeds.

```bash
openssl36 cms -verify -in signed-clear.msg \
  -CAfile ca.crt -signer alice-from-msg.crt \
  -out verified.txt

cat verified.txt
```

Same for the opaque and PSS messages:

```bash
openssl36 cms -verify -in signed-opaque.msg -CAfile ca.crt -out /dev/null
openssl36 cms -verify -in signed-pss.msg -CAfile ca.crt -out /dev/null
```

### 4. Encrypt and decrypt

Default cipher in this OpenSSL 3.6 build is AES-256. Encrypt for one or more recipient certs (no private keys needed to encrypt).

```bash
openssl36 cms -encrypt -in message.txt -out encrypted.msg \
  -from alice@example.com -to bob@example.com \
  -subject "Encrypted CMS demo" \
  alice.crt bob.crt
```

AES-256-GCM produces CMS AuthEnvelopedData:

```bash
openssl36 cms -encrypt -aes-256-gcm -in message.txt -out encrypted-gcm.msg \
  bob.crt
```

RSA-OAEP instead of PKCS#1 v1.5 key transport. Use `-recip` when you pass `-keyopt`:

```bash
openssl36 cms -encrypt -in message.txt -out encrypted-oaep.msg \
  -recip bob.crt -keyopt rsa_padding_mode:oaep
```

Decrypt with the matching recipient key:

```bash
openssl36 cms -decrypt -in encrypted.msg \
  -recip bob.crt -inkey bob.key -out decrypted.txt

openssl36 cms -decrypt -in encrypted-gcm.msg \
  -recip bob.crt -inkey bob.key

openssl36 cms -decrypt -in encrypted-oaep.msg \
  -recip bob.crt -inkey bob.key
```

Alice can decrypt `encrypted.msg` as well, because her cert was also listed as a recipient.

### 5. Sign, then encrypt

Typical S/MIME pattern: sign as Alice, then encrypt for Bob. Do not pass `-text` on the encrypt step; the signed message already has MIME headers.

```bash
openssl36 cms -sign -in message.txt -text \
  -signer alice.crt -inkey alice.key \
  | openssl36 cms -encrypt -out signed-then-encrypted.msg \
      -from alice@example.com -to bob@example.com \
      -subject "Signed and encrypted" \
      bob.crt

openssl36 cms -decrypt -in signed-then-encrypted.msg \
  -recip bob.crt -inkey bob.key \
  | openssl36 cms -verify -CAfile ca.crt -out signed-then-decrypted.txt
```

### 6. Detached DER signature

Useful for files that are not email: keep the original bytes, store a binary CMS signature next to them.

```bash
openssl36 cms -sign -in message.txt -binary -nodetach -outform DER \
  -out message.cms -signer alice.crt -inkey alice.key

openssl36 cms -verify -inform DER -in message.cms \
  -CAfile ca.crt -out message.verified.txt
```

Detached (signature only; original file supplied at verify time):

```bash
openssl36 cms -sign -in message.txt -binary -outform DER \
  -out message.p7s -signer alice.crt -inkey alice.key

openssl36 cms -verify -inform DER -in message.p7s -binary \
  -content message.txt -CAfile ca.crt
```

### 7. Inspect a CMS object

```bash
openssl36 cms -in signed-opaque.msg -cmsout -print -noout
openssl36 cms -in message.cms -inform DER -binary -cmsout -print -noout
```

### 8. ECDH encryption (OpenSSL 3.6 KDF options)

Generate an EC recipient and encrypt with SHA-256 KDF. `-recip_kdf` / `-recip_ukm` are new in 3.6.

```bash
openssl36 req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -keyout carol.key -out carol.csr -nodes \
  -subj "/CN=Carol/emailAddress=carol@example.com" \
  -addext "keyUsage=critical,keyAgreement" \
  -addext "extendedKeyUsage=emailProtection" \
  -addext "subjectAltName=email:carol@example.com"
openssl36 x509 -req -in carol.csr -CA ca.crt -CAkey ca.key \
  -out carol.crt -days 365 -copy_extensions copyall

openssl36 cms -encrypt -in message.txt -out encrypted-ecdh.msg \
  -recip carol.crt -keyopt ecdh_kdf_md:sha256 \
  -recip_kdf SHA256

openssl36 cms -decrypt -in encrypted-ecdh.msg \
  -recip carol.crt -inkey carol.key
```

---

## See also

- [`openssl-cms(1)`](https://docs.openssl.org/3.6/man1/openssl-cms/) for OpenSSL 3.6
- Image: `quay.io/jlapthor/ubi9-openssl36:latest`
