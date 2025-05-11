const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create certs directory if it doesn't exist
const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir);
}

// Generate self-signed certificate using Node.js's built-in OpenSSL
console.log('Generating self-signed certificates...');

try {
  // Write OpenSSL configuration file
  const opensslConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer:always
basicConstraints = CA:true
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
  `;

  fs.writeFileSync(path.join(certsDir, 'openssl.cnf'), opensslConfig);

  // Generate key
  const keyCommand = `node -e "require('crypto').generateKeyPair('rsa', { modulusLength: 2048 }, (err, publicKey, privateKey) => { if (err) throw err; require('fs').writeFileSync('${path.join(certsDir, 'key.pem')}', privateKey.export({type: 'pkcs1', format: 'pem'})); console.log('Private key generated'); });"`;
  execSync(keyCommand, { stdio: 'inherit' });

  // Install required modules if not already installed
  console.log('Installing required modules...');
  execSync('npm install -g selfsigned', { stdio: 'inherit' });

  // Generate cert using selfsigned module
  const certCommand = `node -e "const selfsigned = require('selfsigned'); const attrs = [{ name: 'commonName', value: 'localhost' }]; const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }] }); require('fs').writeFileSync('${path.join(certsDir, 'cert.pem')}', pems.cert); require('fs').writeFileSync('${path.join(certsDir, 'key.pem')}', pems.private); console.log('Certificate generated');"`;
  execSync(certCommand, { stdio: 'inherit' });

  console.log('Self-signed certificates generated successfully in the certs directory');
} catch (error) {
  console.error('Error generating certificates:', error.message);
  process.exit(1);
}
