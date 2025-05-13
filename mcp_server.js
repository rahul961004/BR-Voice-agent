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
    
    // Step 1: Search catalog for each spoken item
    const lineItems = [];
    for (const item of items) {
      // Use /v2/catalog/search-catalog-items for item search
      let catalogItemId = null;
      let variationId = null;
      try {
        const itemSearchResp = await axios.post(
          `${SQUARE_API_URL}/v2/catalog/search-catalog-items`,
          {
            text_filter: item.name,
            enabled_location_ids: [LOCATION_ID],
            limit: 5
          },
          {
            headers: {
              'Square-Version': '2025-04-16',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        if (itemSearchResp.data && itemSearchResp.data.items && itemSearchResp.data.items.length > 0) {
          catalogItemId = itemSearchResp.data.items[0].item_data && itemSearchResp.data.items[0].id;
          variationId = itemSearchResp.data.items[0].item_data && itemSearchResp.data.items[0].item_data.variations && itemSearchResp.data.items[0].item_data.variations.length > 0
            ? itemSearchResp.data.items[0].item_data.variations[0].id
            : null;
        }
      } catch (err) {
        console.error(`Catalog search failed for item '${item.name}':`, err.response?.data || err.message);
      }
      // Step 2: Search for each modifier using /v2/catalog/search-catalog-objects
      let modifiers = [];
      if (item.modifiers && Array.isArray(item.modifiers)) {
        for (const modPhrase of item.modifiers) {
          if (!modPhrase || !modPhrase.trim()) continue;
          try {
            const modResp = await axios.post(
              `${SQUARE_API_URL}/v2/catalog/search-catalog-objects`,
              {
                object_types: ["MODIFIER"],
                query: {
                  text_query: { keywords: [modPhrase] }
                },
                limit: 1
              },
              {
                headers: {
                  'Square-Version': '2025-04-16',
                  'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            if (modResp.data && modResp.data.objects && modResp.data.objects.length > 0) {
              modifiers.push({ catalog_object_id: modResp.data.objects[0].id });
            }
          } catch (err) {
            console.error(`Modifier search failed for '${modPhrase}':`, err.response?.data || err.message);
          }
        }
      }
      // Step 3: Build line item
      if (catalogItemId && variationId) {
        lineItems.push({
          catalog_object_id: variationId,
          quantity: String(item.quantity || 1),
          modifiers: modifiers.length > 0 ? modifiers : undefined,
          note: customer_name ? `For: ${customer_name}` : undefined
        });
      } else {
        // fallback if not found
        lineItems.push({
          name: item.name,
          quantity: String(item.quantity || 1),
          base_price_money: { amount: 1000, currency: 'USD' },
          note: `For: ${customer_name || 'Customer'} - Not in catalog`
        });
      }
    }
    // Step 4: Create order
    const idempotencyKey = `voice-order-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const orderPayload = {
      order: {
        location_id: LOCATION_ID,
        line_items: lineItems,
        state: 'OPEN',
        customer_note: `Voice order for ${customer_name || 'Customer'}`,
        source: { name: 'Burger Rebellion Voice Ordering' }
      },
      idempotency_key: idempotencyKey
    };
    let orderResult = null;
    let terminalResult = null;
    try {
      const orderResp = await axios.post(`${SQUARE_API_URL}/v2/orders`, orderPayload, {
        headers: {
          'Square-Version': '2025-04-16',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      orderResult = orderResp.data;
      console.log('Order created:', JSON.stringify(orderResult, null, 2));
      // Step 5: Create terminal checkout
      const orderId = orderResult.order && orderResult.order.id;
      if (orderId && process.env.TERMINAL_DEVICE_ID) {
        // Calculate order total for amount_money
        let amountMoney = null;
        try {
          const calcResp = await axios.post(`${SQUARE_API_URL}/v2/orders/calculate`, { order_id: orderId }, {
            headers: {
              'Square-Version': '2025-04-16',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });
          if (calcResp.data && calcResp.data.order && calcResp.data.order.total_money) {
            amountMoney = calcResp.data.order.total_money;
          }
        } catch (calcErr) {
          console.error('Order total calculation failed:', calcErr.response?.data || calcErr.message);
        }
        if (amountMoney) {
          try {
            const checkoutPayload = {
              idempotency_key: `checkout-${idempotencyKey}`,
              checkout: {
                order_id: orderId,
                amount_money: amountMoney,
                device_id: process.env.TERMINAL_DEVICE_ID
              }
            };
            const terminalResp = await axios.post(`${SQUARE_API_URL}/v2/terminals/checkouts`, checkoutPayload, {
              headers: {
                'Square-Version': '2025-04-16',
                'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              }
            });
            terminalResult = terminalResp.data;
            console.log('Terminal checkout created:', JSON.stringify(terminalResult, null, 2));
          } catch (termErr) {
            console.error('Terminal checkout failed:', termErr.response?.data || termErr.message);
            terminalResult = { error: 'Terminal checkout failed', details: termErr.response?.data || termErr.message };
          }
        } else {
          terminalResult = { error: 'Order total calculation failed' };
        }
      } else {
        terminalResult = { error: 'No orderId or TERMINAL_DEVICE_ID for terminal checkout' };
      }
      res.json({ order: orderResult, terminal_checkout: terminalResult });
    } catch (orderErr) {
      console.error('Order creation failed:', orderErr.response?.data || orderErr.message);
      res.status(orderErr.response?.status || 500).json({ error: 'Order creation failed', details: orderErr.response?.data || orderErr.message });
    }
  } catch (error) {
    console.error('Unexpected error in create_order handler:', error);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
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
