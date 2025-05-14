import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-04-16' }
});

export async function handler(event) {
  try {
    const { location_id, line_items } = JSON.parse(event.body || '{}');
    const response = await client.ordersApi.createOrder({
      order: {
        locationId: location_id,
        lineItems: line_items
      }
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ orderId: response.result.order.id, totalMoney: response.result.order.totalMoney })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}

