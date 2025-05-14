import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-04-16' }
});

export async function handler(event) {
  try {
    const { text_filter, enabled_location_ids, limit } = JSON.parse(event.body || '{}');
    const response = await client.catalogApi.searchCatalogItems({
      textFilter: text_filter,
      enabledLocationIds: enabled_location_ids,
      limit
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ objects: response.result.items || [] })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}

