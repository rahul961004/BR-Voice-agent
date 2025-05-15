import { SquareClient } from "square";

// Explicitly define environment to avoid import issues
const Environment = {
  Production: 'https://connect.squareup.com',
  Sandbox: 'https://connect.squareupsandbox.com'
};

export async function handler(event) {
  // Enhanced logging for comprehensive debugging
  console.log('List Menu Function - Detailed Diagnostics', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    headers: JSON.stringify(event.headers),
    environment: process.env.NODE_ENV
  });

  // CORS Preflight Handling
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  // Validate HTTP Method
  if (event.httpMethod !== 'GET') {
    console.error('Invalid HTTP Method Attempted:', event.httpMethod);
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Method Not Allowed',
        details: `Received ${event.httpMethod}, expected GET`
      })
    };
  }

  // Validate Access Token
  if (!process.env.SQUARE_ACCESS_TOKEN) {
    console.error('Missing Square Access Token');
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Missing Square Credentials',
        hint: 'Check Netlify environment variables'
      })
    };
  }

  try {
    // Create Square Client
    console.log('Initializing Square Client', {
      accessTokenPresent: !!process.env.SQUARE_ACCESS_TOKEN,
      locationIdProvided: !!process.env.SQUARE_LOCATION_ID
    });

    const client = new SquareClient({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production
    });

    // Search Catalog Items 
    console.log('Searching Catalog Items', {
      locationId: process.env.SQUARE_LOCATION_ID || 'Not Specified'
    });

    const response = await client.catalogApi.searchCatalogObjects({
      objectTypes: ['ITEM'],
      query: {
        filterClause: {
          predicates: [{
            attributeName: 'type',
            attributeValue: 'ITEM'
          }]
        }
      }
    });
    
    // Validate Response
    if (!response.objects || response.objects.length === 0) {
      console.warn('No catalog items found', {
        responseStatus: response.statusCode,
        responseBody: JSON.stringify(response)
      });
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'No menu items found',
          hint: 'Check Square catalog configuration'
        })
      };
    }

    // Transform Catalog Items
    const transformedItems = response.objects
      .filter(item => item.type === 'ITEM')
      .map(item => {
        const variation = item.itemData.variations?.[0]?.itemVariationData;
        return {
          id: item.id,
          name: item.itemData.name || 'Unnamed Item',
          description: item.itemData.description || '',
          price: variation?.priceMoney?.amount || 0,
          currency: variation?.priceMoney?.currency || 'USD'
        };
      });

    console.log(`Transformed ${transformedItems.length} menu items`);

    // Return Response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(transformedItems)
    };
  } catch (error) {
    // Comprehensive Error Logging
    console.error('Menu Retrieval Error', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.statusCode || 'UNKNOWN',
      errorStack: error.stack,
      squareClientConfig: {
        accessTokenPresent: !!process.env.SQUARE_ACCESS_TOKEN,
        locationIdPresent: !!process.env.SQUARE_LOCATION_ID
      }
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to retrieve menu',
        message: error.message,
        details: 'Check server logs for more information'
      })
    };
  }
};
