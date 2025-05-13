import { SquareClient, Environment } from "@square/square";
const client = new SquareClient({
  environment: Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

export async function handler(event) {
  try {
    const { location_id, line_items } = JSON.parse(event.body);
    const resp = await client.ordersApi.createOrder({
      order: {
        locationId: location_id,
        lineItems: line_items
      }
    });
    const order = resp.result.order;
    return {
      statusCode: 200,
      body: JSON.stringify({ order_id: order.id, total_money: order.totalMoney })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
