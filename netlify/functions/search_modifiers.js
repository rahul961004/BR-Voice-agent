import { SquareClient, Environment } from "@square/square";
const client = new SquareClient({
  environment: Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

export async function handler(event) {
  try {
    const { text_query, object_types } = JSON.parse(event.body);
    const resp = await client.catalogApi.searchCatalogObjects({
      objectTypes: object_types,
      query: { textQuery: text_query }
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ objects: resp.result.objects || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
