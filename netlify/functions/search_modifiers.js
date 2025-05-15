import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-03-19' }
});

export async function handler(event) {
  try {
    const { text_query, object_types } = JSON.parse(event.body || '{}');
    const response = await client.catalogApi.searchCatalogObjects({
      objectTypes: object_types,
      query: { textQuery: text_query }
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ objects: response.result.objects || [] })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}
