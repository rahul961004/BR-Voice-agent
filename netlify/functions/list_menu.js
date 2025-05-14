import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-04-16' }
});

export async function handler(event) {
  try {
    const response = await client.catalogApi.listCatalog(undefined, ['ITEM', 'MODIFIER']);
    return {
      statusCode: 200,
      body: JSON.stringify({ items: response.result.objects || [] })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}


