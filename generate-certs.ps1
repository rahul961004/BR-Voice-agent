# Change to the certs directory
cd $PSScriptRoot\certs

# Generate a private key
openssl genrsa -out key.pem 2048

# Generate a certificate signing request
openssl req -new -key key.pem -out csr.pem -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Generate a self-signed certificate valid for 365 days
openssl x509 -req -days 365 -in csr.pem -signkey key.pem -out cert.pem

Write-Host "Self-signed certificates generated in the 'certs' directory"
