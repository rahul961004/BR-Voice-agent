/**
 * ElevenLabs webhook to Square integration for Burger Rebellion
 * Processes webhook data from ElevenLabs and creates orders in Square sandbox
 * Enhanced to fetch catalog and map menu items to Square catalog IDs
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Square API URL for Production
const SQUARE_API_URL = 'https://connect.squareup.com/v2';
// Square API version
const SQUARE_API_VERSION = '2025-03-19';

/**
 * Fetches the Square catalog items and modifiers
 * @param {string} accessToken - Square API access token
 * @param {string} locationId - Square API location ID
 * @returns {Promise<{items: Array, modifiers: Array}>} - Catalog data
 */
// Refactored create-order.js to only search for the ordered item and modifiers using textFilter/textQuery

exports.handler = async (event, context) => {
  try {
    // Parse incoming order data
    const { items, customer_name } = JSON.parse(event.body);
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No items provided in order.' })
      };
    }
    const line = items[0]; // Handle only the first item for brevity
    const productName = line.name;
    const quantity = line.quantity ? line.quantity.toString() : '1';
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const terminalDeviceId = process.env.TERMINAL_DEVICE_ID;
    // 1) Search for the exact item by name
    const itemSearchRes = await axios.post(
      `${SQUARE_API_URL}/catalog/search-catalog-items`,
      {
        text_filter: productName,
        enabled_location_ids: [locationId],
        limit: 1
      },
      {
        headers: {
          'Square-Version': SQUARE_API_VERSION,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const matched = (itemSearchRes.data.items || [])[0];
    if (!matched) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `No item found for "${productName}"` })
      };
    }
    const variationId = matched.item_data.variations?.[0]?.id;
    if (!variationId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `No variation found for item ${matched.id}` })
      };
    }
    // 2) Search each modifier by name
    let modifierIds = [];
    if (Array.isArray(line.modifiers) && line.modifiers.length > 0) {
      for (const modName of line.modifiers) {
        const modRes = await axios.post(
          `${SQUARE_API_URL}/catalog/search-catalog-objects`,
          {
            object_types: ["MODIFIER"],
            query: {
              text_query: { keywords: [modName] }
            }
          },
          {
            headers: {
              'Square-Version': SQUARE_API_VERSION,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const obj = (modRes.data.objects || [])[0];
        if (!obj) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: `No modifier found for "${modName}"` })
          };
        }
        modifierIds.push(obj.id);
      }
    }
    // 3) Create the order
    const orderPayload = {
      idempotency_key: uuidv4(),
      order: {
        location_id: locationId,
        line_items: [
          {
            catalog_object_id: matched.id,
            variation_id: variationId,
            quantity,
            modifiers: modifierIds.map(id => ({ catalog_object_id: id }))
          }
        ],
        customer_note: customer_name || undefined
      }
    };
    const orderRes = await axios.post(
      `${SQUARE_API_URL}/orders`,
      orderPayload,
      {
        headers: {
          'Square-Version': SQUARE_API_VERSION,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const order = orderRes.data.order;
    // 4) (Optional) Send to Terminal for payment if device ID is set
    let terminalCheckout = null;
    if (terminalDeviceId && order && order.id && order.total_money) {
      try {
        const terminalPayload = {
          idempotency_key: uuidv4(),
          checkout: {
            order_id: order.id,
            amount_money: order.total_money,
            device_id: terminalDeviceId
          }
        };
        const terminalRes = await axios.post(
          `${SQUARE_API_URL}/terminals/checkouts`,
          terminalPayload,
          {
            headers: {
              'Square-Version': SQUARE_API_VERSION,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        terminalCheckout = terminalRes.data;
      } catch (err) {
        // Log and continue
        console.error('Terminal checkout error:', err.response?.data || err.message);
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ order, terminalCheckout })
    };
  } catch (err) {
    console.error('create-order error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};


/**
 * Builds a system prompt containing the menu information
 * @param {Object} catalog - The catalog data with items and modifiers
 * @returns {string} - Formatted system prompt with menu items
 */
function buildMenuSystemPrompt(catalog) {
  const { items, modifiers } = catalog;
  
  let prompt = 'Here is the current menu:\n';
  
  // Add items
  items.forEach(item => {
    prompt += `• ${item.name} (item_id=${item.id})\n`;
    
    // Add variations
    if (item.variations && item.variations.length > 0) {
      prompt += `  – Variations: ${item.variations.map(v => `${v.name}(${v.id})`).join(', ')}\n`;
    }
    
    // Add modifier lists
    if (item.modifierLists && item.modifierLists.length > 0) {
      prompt += `  – Modifier lists: ${item.modifierLists.join(', ')}\n`;
    }
  });
  
  // Add modifiers
  modifiers.forEach(modifier => {
    prompt += `• ${modifier.name} (modifier_id=${modifier.id})\n`;
  });
  
  return prompt;
}

/**
 * Maps order items to Square catalog objects with improved matching
 * @param {Array} orderItems - Items from the order request
 * @param {Object} catalog - Catalog data with items and modifiers
 * @returns {Array} - Line items with proper catalog IDs
 */
function mapOrderItemsToCatalog(orderItems, catalog) {
  const { items, modifiers } = catalog;
  
  // Log available catalog items for debugging
  console.log('Available catalog items:');
  items.forEach(item => {
    console.log(`- ${item.name} (ID: ${item.id})`);
    if (item.variations && item.variations.length > 0) {
      item.variations.forEach(v => console.log(`  - Variation: ${v.name} (ID: ${v.id})`));
    }
  });
  
  return orderItems.map(orderItem => {
    // Clean up item name for better matching
    const cleanItemName = (orderItem.name || '').trim().toLowerCase();
    console.log(`Looking for catalog match for: "${cleanItemName}"`);
    
    // Skip if no valid item name
    if (!cleanItemName) {
      console.log('Empty item name, skipping');
      return null;
    }
    
    // Get quantity
    const quantity = parseInt(orderItem.quantity, 10) || 1;
    
    // First try exact match
    let matchingItem = items.find(item => 
      item.name.toLowerCase() === cleanItemName);
    
    // If no exact match, try partial match
    if (!matchingItem) {
      matchingItem = items.find(item => 
        cleanItemName.includes(item.name.toLowerCase()) || 
        item.name.toLowerCase().includes(cleanItemName));
    }
    
    // Check if the order item already has a catalog_object_id
    if (orderItem.catalog_object_id && !orderItem.catalog_object_id.includes('placeholder')) {
      console.log(`Using provided catalog_object_id: ${orderItem.catalog_object_id}`);
      
      // Verify the ID actually exists in our catalog
      const itemWithProvidedId = items.find(item => item.id === orderItem.catalog_object_id);
      if (itemWithProvidedId) {
        // Use the provided ID but get other details from catalog
        return {
          quantity: String(quantity),
          catalog_object_id: orderItem.catalog_object_id,
          modifiers: processModifiers(orderItem.modifiers, modifiers),
          note: orderItem.note || ''
        };
      }
    }
    
    // If no matching item found
    if (!matchingItem) {
      console.log(`No matching item found for: ${orderItem.name}`);
      // Create a custom line item
      return {
        quantity: String(quantity),
        name: orderItem.name,
        base_price_money: {
          amount: 1000, // Default $10.00 CAD
          currency: 'CAD'
        },
        note: orderItem.modifiers?.length > 0 ? `Modifiers: ${orderItem.modifiers.join(', ')}` : ''
      };
    }
    
    console.log(`Found matching item: ${matchingItem.name} (ID: ${matchingItem.id})`);
    
    // Handle variations
    let variationId = null;
    
    // Check if a specific variation_id was provided
    if (orderItem.variation_id && !orderItem.variation_id.includes('placeholder')) {
      console.log(`Using provided variation_id: ${orderItem.variation_id}`);
      // Verify the variation ID exists
      const matchingVariation = matchingItem.variations?.find(v => v.id === orderItem.variation_id);
      if (matchingVariation) {
        variationId = orderItem.variation_id;
      }
    }
    
    // If no valid variation_id, use the first available variation or the item ID
    if (!variationId) {
      variationId = matchingItem.variations?.length > 0 ? 
        matchingItem.variations[0].id : matchingItem.id;
      console.log(`Using default variation: ${variationId}`);
    }
    
    // Create line item with catalog IDs
    return {
      quantity: String(quantity),
      catalog_object_id: variationId,
      modifiers: processModifiers(orderItem.modifiers, modifiers),
      note: orderItem.note || (orderItem.modifiers?.length > 0 ? 
        `Modifiers: ${orderItem.modifiers.join(', ')}` : '')
    };
  }).filter(Boolean); // Remove any null items
}

/**
 * Process modifiers and map them to catalog modifier IDs
 * @param {Array} requestedModifiers - Modifiers from the order request
 * @param {Array} catalogModifiers - Available modifiers from catalog
 * @returns {Array|undefined} - Processed modifiers or undefined if none
 */
function processModifiers(requestedModifiers, catalogModifiers) {
  if (!requestedModifiers || !requestedModifiers.length) {
    return undefined;
  }
  // Only return modifiers with valid catalog_object_id
  const processedModifiers = requestedModifiers.map(mod => {
    if (typeof mod === 'object' && mod.catalog_object_id) {
      return { catalog_object_id: mod.catalog_object_id };
    }
    const modName = typeof mod === 'string' ? mod : mod.name || '';
    const cleanModName = modName.trim().toLowerCase();
    const matchingMod = catalogModifiers.find(m =>
      m.name.toLowerCase() === cleanModName ||
      m.name.toLowerCase().includes(cleanModName) ||
      cleanModName.includes(m.name.toLowerCase())
    );
    if (matchingMod) {
      return { catalog_object_id: matchingMod.id };
    }
    // If no match, do NOT return anything (Square will reject it)
    return null;
  }).filter(Boolean); // Remove nulls
  return processedModifiers.length > 0 ? processedModifiers : undefined;
}

// Function to generate a UUID for idempotency keys
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

exports.handler = async (event, context) => {
  // Set CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Log request details for debugging
  console.log('Request method:', event.httpMethod);
  console.log('Request headers:', JSON.stringify(event.headers, null, 2));
  console.log('Raw request body:', event.body);
  
  // Get Square credentials
  const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  // Use the production location ID from environment variables
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  
  console.log('Using production environment with location ID:', LOCATION_ID);
  
  if (!SQUARE_ACCESS_TOKEN || !LOCATION_ID) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Missing Square credentials (SQUARE_ACCESS_TOKEN or LOCATION_ID)'
      })
    };
  }
  
  try {
    // Step 1: Fetch Square catalog data
    const catalog = await fetchSquareCatalog(SQUARE_ACCESS_TOKEN, LOCATION_ID);
    
    // Step 2: Build system prompt with menu items
    const menuPrompt = buildMenuSystemPrompt(catalog);
    console.log('Generated menu prompt for ElevenLabs agent');
    
    // Parse the incoming webhook data from ElevenLabs
    let webhookData;
    let orderItems = [];
    let customerName = 'Unknown Customer';
    
    try {
      // Parse the webhook data, which could be in different formats depending on ElevenLabs
      const parsedBody = JSON.parse(event.body);
      console.log('Parsed webhook data:', JSON.stringify(parsedBody, null, 2));
      
      // Handle different data formats from ElevenLabs
      if (parsedBody.type === 'elevenlabs-convai' && parsedBody.action === 'order_confirmed') {
        // Format 1: ElevenLabs standard webhook format
        customerName = parsedBody.data?.customer_name || 'Unknown Customer';
        orderItems = Array.isArray(parsedBody.data?.items) ? parsedBody.data.items : [];
      } else if (parsedBody.transcript) {
        // Format 2: ElevenLabs transcript format
        customerName = parsedBody.name || parsedBody.customer_name || 'Unknown Customer';
        
        // Try to extract orders from transcript - this is a fallback
        // In this case, we'd need to do some NLP to extract items
        console.log('Received transcript format, attempting to extract order data');
        // For now, just log the transcript
        console.log('Transcript:', parsedBody.transcript);
        
        // Extract items - simple direct format
        if (parsedBody.items && Array.isArray(parsedBody.items)) {
          orderItems = parsedBody.items;
        }
      } else {
        // Format 3: Direct format as provided in our example
        customerName = parsedBody.customer_name || 'Unknown Customer';
        orderItems = Array.isArray(parsedBody.items) ? parsedBody.items : [];
      }
    } catch (parseError) {
      console.error('Error parsing webhook data:', parseError.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON in request body',
          menu_prompt: menuPrompt 
        })
      };
    }
    
    console.log(`Extracted customer name: ${customerName}`);
    console.log(`Extracted ${orderItems.length} order items:`, JSON.stringify(orderItems, null, 2));
    
    if (orderItems.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'No items in order',
          menu_prompt: menuPrompt // Include menu prompt even on error
        })
      };
    }
    
    try {
      // Step 3: Map order items to catalog items
      const catalogLineItems = mapOrderItemsToCatalog(orderItems, catalog);
      console.log('Mapped order items to catalog:', JSON.stringify(catalogLineItems, null, 2));
      
      const idempotencyKey = generateUUID();
      
      // Step 4: Create order payload with catalog object IDs
      const orderPayload = {
        idempotency_key: idempotencyKey,
        order: {
          location_id: LOCATION_ID,
          line_items: catalogLineItems,
          state: 'OPEN',
          customer_note: `Voice order for ${customerName}`,
          source: {
            name: 'ElevenLabs Voice Ordering'
          }
        }
      };
      
      console.log('Creating order with payload:', JSON.stringify(orderPayload, null, 2));
      
      // Make Square API call to create order
      const squareResponse = await axios.post(`${SQUARE_API_URL}/orders`, orderPayload, {
        headers: {
          'Square-Version': SQUARE_API_VERSION,
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Order created successfully:', JSON.stringify(squareResponse.data, null, 2));
      const orderId = squareResponse.data.order?.id;
      // Step 5: Create payment for the order
      let paymentResult = null;
      if (orderId) {
        try {
          // Calculate amount from order total_money
          const amountMoney = squareResponse.data.order?.total_money;
          if (!amountMoney) throw new Error('Order total_money missing, cannot create payment.');
          // Use a fake nonce for testing or require a real card nonce for production
          // For production, replace 'cnon:card-nonce-ok' with a real card nonce from Square payment form
          const paymentPayload = {
            idempotency_key: `${idempotencyKey}-pay`,
            amount_money: amountMoney,
            source_id: 'cnon:card-nonce-ok', // Replace with real card nonce in production
            order_id: orderId,
            location_id: LOCATION_ID
          };
          const paymentResp = await axios.post(`${SQUARE_API_URL}/payments`, paymentPayload, {
            headers: {
              'Square-Version': SQUARE_API_VERSION,
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });
          paymentResult = paymentResp.data;
          console.log('Payment created successfully:', JSON.stringify(paymentResult, null, 2));
        } catch (paymentErr) {
          console.error('Payment creation failed:', paymentErr.response?.data || paymentErr.message);
          paymentResult = { error: paymentErr.response?.data || paymentErr.message };
        }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Order created successfully in Square',
          order_id: orderId || 'unknown',
          order_data: squareResponse.data,
          payment: paymentResult,
          menu_prompt: menuPrompt // Include menu prompt in successful response
        })
      };

    } catch (squareError) {
      console.error('Error creating order:', squareError.response?.data || squareError.message);
      
      // Return a consistent error response
      return {
        statusCode: 200, // Return 200 even on error to prevent webhook retries
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Error creating order in Square',
          error: squareError.response?.data?.errors || squareError.message,
          webhook_received: true,
          menu_prompt: menuPrompt // Include menu prompt in error response
        })
      };
    }
  } catch (error) {
    // Log the full error for debugging
    console.error('Error processing webhook:', error);
    
    // Return a helpful error response
    return {
      statusCode: 200, // Return 200 even on error to prevent webhook retries
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Error processing order',
        error: error.message,
        webhook_received: true,
        menu_prompt: catalog ? buildMenuSystemPrompt(catalog) : 'Menu not available due to error'
      })
    };
  }
};

