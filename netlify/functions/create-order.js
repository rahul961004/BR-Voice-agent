/**
 * Simple serverless function for ElevenLabs webhook to Square integration
 * This is a minimal implementation that prioritizes reliability
 */
const { SquareClient, SquareEnvironment } = require('square');
require('dotenv').config();

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
  
  // Log all request details for debugging
  console.log('Request method:', event.httpMethod);
  console.log('Request headers:', JSON.stringify(event.headers, null, 2));
  console.log('Raw request body:', event.body);
  
  try {
    // Check if environment variables are set correctly
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    const LOCATION_ID = process.env.LOCATION_ID;
    
    console.log(`SQUARE_ACCESS_TOKEN present: ${SQUARE_ACCESS_TOKEN ? 'Yes (redacted)' : 'No'}`);
    console.log(`LOCATION_ID present: ${LOCATION_ID ? LOCATION_ID : 'No'}`);
    
    // Parse the incoming webhook data
    let webhookData;
    try {
      webhookData = JSON.parse(event.body);
      console.log('Parsed webhook data:', JSON.stringify(webhookData, null, 2));
    } catch (parseError) {
      console.error('Error parsing webhook data:', parseError.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON in request body' })
      };
    }
    
    // Extract customer name and items from the webhook data
    const customerName = webhookData.customer_name || 'Unknown Customer';
    const orderItems = Array.isArray(webhookData.items) ? webhookData.items : [];
    
    console.log(`Extracted customer name: ${customerName}`);
    console.log(`Extracted ${orderItems.length} order items:`, JSON.stringify(orderItems, null, 2));
    
    // Initialize Square client
    const squareClient = new SquareClient({
      accessToken: SQUARE_ACCESS_TOKEN,
      environment: SquareEnvironment.Sandbox
    });
    
    // Prepare line items for Square
    const lineItems = orderItems.map(item => ({
      name: item.name || 'Unknown Item',
      quantity: String(item.quantity || 1),
      basePriceMoney: {
        amount: 1000, // Default price $10.00
        currency: 'USD'
      },
      note: item.modifiers && item.modifiers.length > 0 ? 
        `Modifiers: ${item.modifiers.join(', ')}` : undefined
    }));
    
    // Create order payload
    const orderPayload = {
      order: {
        locationId: LOCATION_ID,
        lineItems: lineItems,
        state: 'OPEN',
        customerNote: `Voice order for ${customerName}`
      },
      idempotencyKey: `voice-order-${Date.now()}`
    };
    
    console.log('Sending order to Square:', JSON.stringify(orderPayload, null, 2));
    
    // Create order in Square
    const { result } = await squareClient.ordersApi.createOrder(orderPayload);
    console.log('Order created successfully:', JSON.stringify(result, null, 2));
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Order created successfully', 
        order_id: result.order.id 
      })
    };
  } catch (error) {
    // Log the full error for debugging
    console.error('Error processing order:', error);
    
    // Return a helpful error response
    return {
      statusCode: 200, // Return 200 even on error to prevent webhook retries
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Error processing order', 
        error: error.message,
        webhook_received: true
      })
    };
  }
};
function findCatalogItem(catalogCache, itemName) {
  if (!itemName) return null;
  
  const normalizedName = itemName.toLowerCase().trim();
  
  // Use a demo catalog for testing if needed
  if (!catalogCache || catalogCache.length === 0) {
    catalogCache = getDemoCatalog();
  }
  
  // Look for best match
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

// Provide a demo catalog for testing
function getDemoCatalog() {
  return [
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
}

// Handler for Netlify serverless function
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
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    // Parse request body
    console.log('Raw request body:', event.body);
    const requestBody = JSON.parse(event.body);
    console.log('Parsed request body:', JSON.stringify(requestBody, null, 2));
    
    // Extract data - be flexible with format that might come from ElevenLabs
    let customerName = '';
    let orderItems = [];
    
    // Check for typical properties we might receive
    if (requestBody.customer_name) {
      customerName = requestBody.customer_name;
    } else if (requestBody.customerName) {
      customerName = requestBody.customerName;
    } else if (requestBody.name) {
      customerName = requestBody.name;
    }
    
    // Check for items array in different possible formats
    if (Array.isArray(requestBody.items)) {
      orderItems = requestBody.items;
    } else if (Array.isArray(requestBody.orderItems)) {
      orderItems = requestBody.orderItems;
    } else if (requestBody.order && Array.isArray(requestBody.order.items)) {
      orderItems = requestBody.order.items;
    } else if (typeof requestBody === 'object') {
      // Try to extract items from the structure if they're not in an expected format
      for (const key in requestBody) {
        if (Array.isArray(requestBody[key])) {
          const possibleItems = requestBody[key];
          if (possibleItems.length > 0 && 
              (possibleItems[0].name || possibleItems[0].item || possibleItems[0].product)) {
            orderItems = possibleItems;
            break;
          }
        }
      }
    }
    
    console.log('Extracted customer name:', customerName);
    console.log('Extracted order items:', JSON.stringify(orderItems, null, 2));
    
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No items provided in the order',
          receivedData: requestBody 
        })
      };
    }
    
    // Create a demo catalog for testing
    const catalogCache = getDemoCatalog();
    
    // Match items to catalog
    const lineItems = [];
    
    for (const item of orderItems) {
      // Extract item name - be flexible with the property name
      const itemName = item.name || item.item || item.product || item.description || '';
      
      // Log what we're processing
      console.log(`Processing item: ${JSON.stringify(item)}`);
      console.log(`Extracted item name: ${itemName}`);
      
      // Find matching item in catalog
      const catalogItem = findCatalogItem(catalogCache, itemName);
      
      if (catalogItem) {
        // Create Square line item - be flexible with the quantity property
        const quantity = item.quantity || item.count || item.amount || 1;
        console.log(`Item quantity: ${quantity}`);
        
        const lineItem = {
          quantity: String(quantity),
          note: customerName ? `For: ${customerName}` : undefined
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
        
        // Add modifiers if present - be flexible with different property names
        const modifiers = item.modifiers || item.modifications || item.options || [];
        if (Array.isArray(modifiers) && modifiers.length > 0) {
          const validModifiers = modifiers.filter(mod => mod && mod !== '');
          if (validModifiers.length > 0) {
            lineItem.note = (lineItem.note || '') + ` - Mods: ${validModifiers.join(', ')}`;
          }
        } else if (typeof item.modifiers === 'string' && item.modifiers.trim() !== '') {
          // Handle case where modifiers might be a single string
          lineItem.note = (lineItem.note || '') + ` - Mods: ${item.modifiers.trim()}`;
        }
        
        lineItems.push(lineItem);
      } else {
        // Fallback if item not found in catalog
        const itemName = item.name || item.item || item.product || item.description || 'Unknown Item';
        const quantity = item.quantity || item.count || item.amount || 1;
        
        lineItems.push({
          name: itemName,
          quantity: String(quantity),
          note: `For: ${customerName || 'Customer'} - Not in catalog`,
          base_price_money: {
            amount: 1000, // Default $10.00
            currency: 'USD'
          }
        });
        
        console.log(`Added fallback item: ${itemName}, quantity: ${quantity}`);
      }
    }
    
    // Create order in Square using the SDK
    try {
      if (!squareClient) {
        throw new Error('Square client not initialized');
      }
      
      if (!LOCATION_ID) {
        throw new Error('Square location ID not configured');
      }
      
      // First, log our final processed items
      console.log('Final processed line items for Square:', JSON.stringify(lineItems, null, 2));
      
      const orderPayload = {
        order: {
          locationId: LOCATION_ID,
          lineItems: lineItems,
          state: 'OPEN',
          customerNote: `Voice order for ${customerName || 'Customer'}`,
          source: {
            name: 'Burger Rebellion Voice Ordering'
          }
        },
        idempotencyKey: `voice-order-${Date.now()}`
      };
      
      console.log('Sending order to Square using SDK:', JSON.stringify(orderPayload, null, 2));
      console.log(`Using Location ID: ${LOCATION_ID}`);
      
      // Make the API call to Square using SDK
      try {
        // Check if the line items array is valid and not empty
        if (!lineItems || lineItems.length === 0) {
          throw new Error('Cannot create order: No valid line items to send to Square');
        }
        
        // Make sure we have a valid location ID
        if (!LOCATION_ID) {
          throw new Error('Cannot create order: Missing Square location ID');
        }

        // Verify that our Square client is properly initialized
        if (!squareClient || !squareClient.ordersApi) {
          throw new Error('Cannot create order: Square SDK client not properly initialized');
        }
        
        // Make the API call with proper error handling
        const { result } = await squareClient.ordersApi.createOrder(orderPayload);
        
        console.log('Square SDK response:', JSON.stringify(result, null, 2));
        console.log('Order created successfully:', JSON.stringify(result, null, 2));
        
        // Return successful response
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Order created successfully',
            order_id: result.order?.id,
            order: result
          })
        };
      } catch (squareSdkError) {
        console.error('Error from Square SDK:', squareSdkError);
        
        // Return a more meaningful error that includes the specific SDK error details
        return {
          statusCode: 422, // Unprocessable Entity - better than 500 for client debugging
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Failed to create order in Square',
            error: squareSdkError.message,
            details: squareSdkError.errors || [],
            data_sent: orderPayload
          })
        };
      }
    } catch (squareError) {
      // Detailed error logging to diagnose the issue
      console.error('Error creating order in Square:');
      
      if (squareError instanceof SquareError) {
        // This is a Square-specific error with more details
        console.error('Square API Error:');
        
        // Log each error in the array
        squareError.errors.forEach(error => {
          console.error('Category:', error.category);
          console.error('Code:', error.code);
          console.error('Detail:', error.detail);
        });
        
        // Return error response to client
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Failed to create order in Square',
            error: squareError.message,
            received_data: requestBody,
            extracted_data: {
              customer_name: customerName,
              line_items: orderItems
            }
          })
        };
      }
    }
  } catch (error) {
    console.error('Error processing order:', error.message);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process order',
        details: error.message
      })
    };
  }
};
