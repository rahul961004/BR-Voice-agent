import { Client, Environment } from "square";
import { v4 as uuidv4 } from 'uuid';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-03-19' }
});

// CORS Headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json'
};

export async function handler(event) {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('Create Order Function - Request:', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    body: event.body
  });

  try {
    const requestData = JSON.parse(event.body || '{}');
    const location_id = requestData.location_id || process.env.SQUARE_LOCATION_ID;
    const items = requestData.items || [];

    if (!location_id || !Array.isArray(items) || items.length === 0) {
      throw new Error('Invalid input: location_id and non-empty items array are required');
    }

    // Format line items for Square API
    const lineItems = items.map(item => ({
      catalogObjectId: item.catalog_object_id || item.variation_id,  // Support both formats
      quantity: String(item.quantity || '1'),
      modifiers: [],
      appliedTaxes: [],
      appliedDiscounts: []
    }));

    const orderRequest = {
      idempotencyKey: requestData.idempotency_key || uuidv4(),
      order: {
        locationId: location_id,
        lineItems: lineItems,
        state: requestData.state || 'DRAFT',   // default to DRAFT
        customerId: requestData.customer_id, // Optional
        metadata: {
          orderSource: 'n8n-voice-ordering'
        }
      }
    };

    const response = await client.ordersApi.createOrder(orderRequest);
    console.log('Order created successfully:', response.result.order.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderId: response.result.order.id,
        order: response.result.order
      })
    };

  } catch (error) {
    console.error('Error creating order:', error);
    
    return {
      statusCode: error.statusCode || 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to create order',
        details: error.response?.data || {}
      })
    };
  }
};
