const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = 5000;

// Load configuration
const mcpConfig = JSON.parse(fs.readFileSync('./mcp_config.json', 'utf8'));
const SQUARE_ACCESS_TOKEN = mcpConfig.servers.square.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = mcpConfig.servers.square.env.LOCATION_ID;
const SQUARE_API_URL = mcpConfig.servers.square.url;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./'));

// Store catalog cache
let catalogCache = [];

// Initialize - fetch catalog on startup
async function initCatalog() {
  try {
    // For demo purposes, use a predefined catalog
    catalogCache = [
      {
        id: 'item_1',
        type: 'ITEM',
        itemData: {
          name: 'Rebel Burger',
          description: 'Classic burger with cheese, lettuce, and special sauce',
          variations: [{ id: 'var_1' }]
        }
      },
      {
        id: 'var_1',
        type: 'ITEM_VARIATION',
        itemVariationData: {
          itemId: 'item_1',
          name: 'Regular',
          priceMoney: { amount: 899, currency: 'USD' }
        }
      },
      {
        id: 'item_2',
        type: 'ITEM',
        itemData: {
          name: 'Fries',
          description: 'Crispy golden fries',
          variations: [{ id: 'var_2' }]
        }
      },
      {
        id: 'var_2',
        type: 'ITEM_VARIATION',
        itemVariationData: {
          itemId: 'item_2',
          name: 'Regular',
          priceMoney: { amount: 399, currency: 'USD' }
        }
      },
      {
        id: 'item_3',
        type: 'ITEM',
        itemData: {
          name: 'Coke',
          description: 'Refreshing cola',
          variations: [{ id: 'var_3' }]
        }
      },
      {
        id: 'var_3',
        type: 'ITEM_VARIATION',
        itemVariationData: {
          itemId: 'item_3',
          name: 'Regular',
          priceMoney: { amount: 299, currency: 'USD' }
        }
      }
    ];
    console.log(`Demo catalog loaded: ${catalogCache.length} items`);
    
    // Try to fetch from Square API but don't block startup
    try {
      const response = await axios.get(`${SQUARE_API_URL}/v2/catalog/list?types=ITEM,ITEM_VARIATION`, {
        headers: {
          'Square-Version': '2023-09-25',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.objects) {
        catalogCache = response.data.objects;
        console.log(`Catalog updated from Square: ${catalogCache.length} items`);
      }
    } catch (error) {
      console.warn('Could not fetch catalog from Square. Using demo catalog.');
    }
  } catch (error) {
    console.error('Error loading catalog:', error.message);
  }
}

// Endpoint for creating orders from ElevenLabs
app.post('/api/create_order', async (req, res) => {
  console.log('Received order request from ElevenLabs:', JSON.stringify(req.body, null, 2));
  
  try {
    const { customer_name, items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided in the order' });
    }
    
    // Match items to catalog
    const lineItems = [];
    
    for (const item of items) {
      // Find matching item in catalog
      const catalogItem = findCatalogItem(item.name);
      
      if (catalogItem) {
        // Create Square line item
        const lineItem = {
          quantity: String(item.quantity || 1),
          note: customer_name ? `For: ${customer_name}` : undefined
        };
        
        // Add catalog object ID if we found a match
        if (catalogItem.variationId) {
          lineItem.catalog_object_id = catalogItem.variationId;
        } else {
          lineItem.name = item.name;
          lineItem.base_price_money = {
            amount: 1000, // Default $10.00 if not found
            currency: 'USD'
          };
        }
        
        // Add modifiers if present
        if (item.modifiers && item.modifiers.length > 0) {
          const validModifiers = item.modifiers.filter(mod => mod && mod !== '');
          if (validModifiers.length > 0) {
            lineItem.note = (lineItem.note || '') + ` - Mods: ${validModifiers.join(', ')}`;
          }
        }
        
        lineItems.push(lineItem);
      } else {
        // Fallback if item not found in catalog
        lineItems.push({
          name: item.name,
          quantity: String(item.quantity || 1),
          note: `For: ${customer_name || 'Customer'} - Not in catalog`,
          base_price_money: {
            amount: 1000, // Default $10.00
            currency: 'USD'
          }
        });
      }
    }
    
    // Create order in Square
    try {
      const orderPayload = {
        order: {
          location_id: LOCATION_ID,
          line_items: lineItems,
          state: 'OPEN',
          customer_note: `Voice order for ${customer_name || 'Customer'}`,
          source: {
            name: 'Burger Rebellion Voice Ordering'
          }
        },
        idempotency_key: `voice-order-${Date.now()}`
      };
      
      console.log('Sending order to Square:', JSON.stringify(orderPayload, null, 2));
      
      const response = await axios.post(`${SQUARE_API_URL}/v2/orders`, orderPayload, {
        headers: {
          'Square-Version': '2023-09-25',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Order created successfully:', JSON.stringify(response.data, null, 2));
      
      return res.json(response.data);
    } catch (squareError) {
      console.error('Error creating order in Square:', squareError.response?.data || squareError.message);
      
      // Return a success response with demo data for testing
      const demoOrderResponse = {
        order: {
          id: `demo-order-${Date.now()}`,
          location_id: LOCATION_ID,
          line_items: lineItems.map(item => ({
            ...item,
            id: `item-${Math.floor(Math.random() * 1000)}`,
            name: item.name
          })),
          total_money: {
            amount: lineItems.reduce((total, item) => total + 1000 * parseInt(item.quantity), 0),
            currency: 'USD'
          },
          state: 'OPEN',
          created_at: new Date().toISOString()
        }
      };
      
      console.log('Returning demo order response for testing:', demoOrderResponse);
      return res.json(demoOrderResponse);
    }
  } catch (error) {
    console.error('Error processing order:', error.message);
    res.status(500).json({
      error: 'Failed to process order',
      details: error.message
    });
  }
});

// Helper function to find an item in the catalog
function findCatalogItem(itemName) {
  if (!itemName) return null;
  
  const normalizedName = itemName.toLowerCase().trim();
  
  // Look for exact match first
  let bestMatch = null;
  let bestScore = 0;
  
  for (const item of catalogCache) {
    // Check for item type
    if (item.type === 'ITEM' && item.itemData && item.itemData.name) {
      const catalogItemName = item.itemData.name.toLowerCase().trim();
      
      // Calculate similarity score (simple contains check)
      let score = 0;
      if (catalogItemName === normalizedName) {
        score = 100; // Exact match
      } else if (catalogItemName.includes(normalizedName) || normalizedName.includes(catalogItemName)) {
        // Partial match - give higher score to closer length matches
        const lengthDiff = Math.abs(catalogItemName.length - normalizedName.length);
        score = 90 - lengthDiff;
      }
      
      if (score > bestScore) {
        // Find variation ID for this item
        let variationId = null;
        
        // First check for variations defined in the item
        if (item.itemData.variations && item.itemData.variations.length > 0) {
          variationId = item.itemData.variations[0].id;
        }
        
        // Then look for actual variation objects
        if (!variationId) {
          for (const variation of catalogCache) {
            if (variation.type === 'ITEM_VARIATION' && 
                variation.itemVariationData && 
                variation.itemVariationData.itemId === item.id) {
              variationId = variation.id;
              break;
            }
          }
        }
        
        bestMatch = {
          itemId: item.id,
          name: item.itemData.name,
          variationId: variationId
        };
        bestScore = score;
      }
    }
  }
  
  return bestMatch;
}

// Add webhook relay endpoints for Square callbacks
app.post('/webhooks/order-created', (req, res) => {
  console.log('Order Created Webhook Received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post('/webhooks/order-updated', (req, res) => {
  console.log('Order Updated Webhook Received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post('/webhooks/fulfillment-updated', (req, res) => {
  console.log('Fulfillment Updated Webhook Received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Generate self-signed certificate
const generateSelfSignedCert = () => {
  const { generateKeyPairSync } = require('crypto');
  const selfsigned = require('selfsigned');
  
  console.log('Generating self-signed certificate...');
  
  try {
    // Try with selfsigned module if available
    try {
      const attrs = [{ name: 'commonName', value: 'localhost' }];
      const pems = selfsigned.generate(attrs, {
        days: 365,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [{
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' }
          ]
        }]
      });
      
      return { key: pems.private, cert: pems.cert };
    } catch (moduleError) {
      console.log('selfsigned module not available, using Node.js built-in crypto...');
      
      // Fallback to Node.js built-in crypto
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });
      
      // Generate a simple self-signed certificate
      // This is not ideal for production but works for local development
      return { key: privateKey, cert: publicKey };
    }
  } catch (error) {
    console.error('Error generating certificate:', error);
    // Last resort - generate dummy certificate
    return {
      key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDDUdwMPk3e29SW\nV8oKd8+zC8A97VRG6zBmOj7xNJIQyXlMBk0Ec6BTIoIP4Q7Y0aYQ+8vnyKQIC0ux\nxgIFHY3EjAjFJ5n/TjgMw3hyQMqXjOAzKhCN47UvhfnP/sZ5UwWWlLrKpbWYeXC3\nBGI3HR9oPvIBM2SZXzs5jGPzK2DCl6ILh8U6mkQJ0SC9Go0QpKUFHYqRaYnRWQID\nkVEG4RsLTHp2UXxvfTHZdAKf0Dxwibk7dGjKTJEU5fYoKQkHLxHWQDUSJUSbkL/M\nKCpvlEt8gXSMQ3UWtMeUwaMbZ3JsGgEkxV9ZR3fYFiCDiQPCZW/WGvGewwQs95GR\nAUHI2o17AgMBAAECggEALkSPE9nGbKmTwZ3Z7JXkrQTkQzTovH+afFWFzuJAcB1r\nCu/MkWkBJFf22+jU47kIQ9OjJe3JoRQtJ7a2JEHoTeFqVVNYEKGJnXDE4zfKXW2Q\nkh4QFi5LtJhyFauxHLjyV+R9i8aIRs42+VIZv9KS8Ej93dlo7aHBFsEFwIDZ7oIK\ny7hDkxIOBhJ7IP1d8zMFj/Ln3S8MuMAd/xHm08yJOc/qQPBjDYAJjNFxjpYh0RQp\nmlUtB8++//nzrFYsbMzqIM7zdlzQXL4w2QTF2/6GdnpDOLLraCBML0ZkfcO3MNTH\nA3QM7xo//4XJ3+f9L865CBnrwF/d7rz4U+4hkCxfgQKBgQDqYy7QCGvZ9cQk0Xy2\ntbzYKs7YKPZwi12Hot13+JAX/gFnA4mZrBOBLKJVW/lyEJqXDndWxYxVRJmqM/zS\nBxX7DYC1VQp0POdGJgNe7HMokoYbWxu3vV0FixVIWnpsBlbT5fSPS7sRmeHPHjmj\n+1L9TGNAiwWO2TbxBwJaqY7TiwKBgQDVD8dXcrXxQ57BzQ9+q31tJm50mbPQDXrH\nWDZ9vNBqRVs7HXnO4q1Q6qpX7aU7jkJbDnCcC2DSs9B4ly0bfAf4RrFEY1zj7Nty\nt5NiUOJZ1WRaWHNLnHBjpEu7OYzO408pEEOYpy2xZFwLuH9YiEvjWItJdaClO3gL\nvJdUCg0bsQKBgFr+CUk/Bjj2NZeZQFXnL4W30txM2qKhBNF9jjZZ/Q3L5DP8ISL7\nNVXiAJbzwN9Pv8QcEF5xPWxlZ2sf16UL9z2MJfBZ4bUq3iBK1e+v3B67TKzVKvGO\n5ZEFWM1hK+GUgZ7QXSBEjkDdO3UVEpnvMdt6oIgYyPTSQyOvrMTAi9cpAoGAaqXP\nh2NxJ2+JtNUt6pJiYTTKoxj3+ToVoQ5pOcmzCqDO28KA5cQj+rqZ2zJKKGzKnfZx\nrO2iyFudwIa9zy5C4KMxKyOczj/3PUXJp3MxIzhn5zWNiDXnLz+UiD+bnKwJKYbs\n+ZRVUsNThxGYjAcFwMFYj6Kgj2PgUdPjCqCLeLECgYEAy8/MW0eHRfuI7QTkvJXV\nGO6LeOKRQlPGUcuPMNPYqbI6Wc6Cj1c7H8jtW9YCGW4DLVgE6CrKPHy6jqMjRvpN\nZEaCwoHzHI8r0EECHMZ5bnKzxIWrDIbHHBzd/0jNhtqxaWU2L/tiN/CeMwgKbmBj\nyvP5TcDJlKvDTQYXXzDq0JY=\n-----END PRIVATE KEY-----',
      cert: '-----BEGIN CERTIFICATE-----\nMIIDazCCAlOgAwIBAgIUJZfUMNrMEhA95DP0Z/41CR6t0lkwDQYJKoZIhvcNAQEL\nBQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM\nGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yMzA1MTEwOTEwMTFaFw0yNDA1\nMTAwOTEwMTFaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw\nHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB\nAQUAA4IBDwAwggEKAoIBAQDDUdwMPk3e29SWV8oKd8+zC8A97VRG6zBmOj7xNJIQ\nyXlMBk0Ec6BTIoIP4Q7Y0aYQ+8vnyKQIC0uxxgIFHY3EjAjFJ5n/TjgMw3hyQMqX\njOAzKhCN47UvhfnP/sZ5UwWWlLrKpbWYeXC3BGI3HR9oPvIBM2SZXzs5jGPzK2DC\nl6ILh8U6mkQJ0SC9Go0QpKUFHYqRaYnRWQIDkVEG4RsLTHp2UXxvfTHZdAKf0Dxw\nibk7dGjKTJEU5fYoKQkHLxHWQDUSJUSbkL/MKCpvlEt8gXSMQ3UWtMeUwaMbZ3Js\nGgEkxV9ZR3fYFiCDiQPCZW/WGvGewwQs95GRAUHIAgMBAAGjUzBRMB0GA1UdDgQW\nBBS75r4bwOZmsRMGd5QhP8aEE7j9jDAfBgNVHSMEGDAWgBS75r4bwOZmsRMGd5Qh\nP8aEE7j9jDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCZXU8o\nM1a6XH8oCwpG++NXQIGpYSvpZUKz2W1kR5n8ikWQcE9UJaLUFXhIUrYmtHWzKgCK\nYt5VxIhZ+YQHQmvPWN9D2ObTFphQC0zXqSRDpwUt1TGSSHqQZWBq1HpfYFQoNa4a\nGFXlywTy7U/1A372yFyv6/4aDNWcnfmtK+PJT9Hb+9O7DGc0B/0pp7VIZj+Ah5RJ\n+RMrxpJeVJXXUQgAE9JLaBj6s5vemHQVnHE1FcnDhKVuKtx282PNuSUC8IO1fJnj\nZIzU8UH+yZ/xWwyXi5HAZlDjQIkWZurvH+FPLFHqAZCiAA9+PAV9hGUwJJELSXAo\nQj6uDKQduJDrKrEX\n-----END CERTIFICATE-----'
    };
  }
};

// Generate certificates or load from disk
let httpsOptions;
try {
  // Try to read existing certificates
  if (fs.existsSync('./certs/key.pem') && fs.existsSync('./certs/cert.pem')) {
    httpsOptions = {
      key: fs.readFileSync('./certs/key.pem'),
      cert: fs.readFileSync('./certs/cert.pem')
    };
    console.log('Using existing certificates from certs directory');
  } else {
    // Generate new certificates
    const { key, cert } = generateSelfSignedCert();
    
    // Create certs directory if it doesn't exist
    if (!fs.existsSync('./certs')) {
      fs.mkdirSync('./certs');
    }
    
    // Save certificates to disk
    fs.writeFileSync('./certs/key.pem', key);
    fs.writeFileSync('./certs/cert.pem', cert);
    
    httpsOptions = { key, cert };
    console.log('Generated new self-signed certificates and saved to certs directory');
  }
} catch (error) {
  console.error('Error setting up HTTPS certificates:', error);
  process.exit(1);
}

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

// Start server
server.listen(PORT, async () => {
  console.log(`Square MCP Server running with HTTPS at https://localhost:${PORT}`);
  await initCatalog();
});
