const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
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
    const response = await axios.get(`${SQUARE_API_URL}/v2/catalog/list?types=ITEM,ITEM_VARIATION`, {
      headers: {
        'Square-Version': '2023-09-25',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.objects) {
      catalogCache = response.data.objects;
      console.log(`Catalog loaded: ${catalogCache.length} items`);
    }
  } catch (error) {
    console.error('Error loading catalog:', error.response ? error.response.data : error.message);
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
    
    // Try to calculate the order total
    try {
      const calculationResponse = await calculateOrderTotal(response.data.order.id);
      res.json({
        ...response.data,
        calculation: calculationResponse
      });
    } catch (calcError) {
      console.error('Error calculating order total:', calcError);
      res.json(response.data);
    }
  } catch (error) {
    console.error('Error creating order:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    res.status(error.response?.status || 500).json({
      error: 'Failed to create order',
      details: error.response?.data || error.message
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

// Helper function to calculate order total
async function calculateOrderTotal(orderId) {
  try {
    const response = await axios.post(`${SQUARE_API_URL}/v2/orders/calculate`, 
      { order_id: orderId }, 
      {
        headers: {
          'Square-Version': '2023-09-25',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error calculating order total:', error.response?.data || error.message);
    throw error;
  }
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

// Start server
app.listen(PORT, async () => {
  console.log(`Square MCP Server running at http://localhost:${PORT}`);
  await initCatalog();
});
