import { SquareClient, Environment } from "@square/square";
const client = new SquareClient({
  environment: Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

export async function handler(event) {
  try {
    const { text_filter, enabled_location_ids, limit } = JSON.parse(event.body);
    const resp = await client.catalogApi.searchCatalogItems({
      textFilter: text_filter,
      enabledLocationIds: enabled_location_ids,
      limit
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ items: resp.result.items || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
