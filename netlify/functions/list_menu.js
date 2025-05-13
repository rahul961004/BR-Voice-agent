import { SquareClient, Environment } from "@square/square";
const client = new SquareClient({
  environment: Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
  try {
    const resp = await client.catalogApi.listCatalog(undefined, ["ITEM", "MODIFIER"]);
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

