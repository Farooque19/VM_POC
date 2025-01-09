import { useFetcher, useLoaderData } from '@remix-run/react';
import { AppProvider, Page, Card, MediaCard } from '@shopify/polaris';
import type { ActionFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { useState } from 'react';

// interface ReorderData {
//   id: string;
//   moves: { id: string; newPosition: string }[];
// }

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id } = params;
  const { admin } = await authenticate.admin(request);
  let hasNextPage: boolean = true;
  let afterCursor: string | null = null;
  let products: any[] = [];
  let ids: string[] = [];

  let collectionId: string = `gid://shopify/Collection/${id}`;
  while(hasNextPage) {
    const response = await admin.graphql(`
      query GetNextCollectionProducts($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 10, after: $after) {
            edges {
              node {
                legacyResourceId
                id
                title
                handle
                vendor
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
    {
      variables: {
        id: collectionId,
        after: afterCursor
      }
    }
    );
    const productsData: any = (await response.json()).data;
    
    products.push(...productsData.collection.products.edges);
    for(let product of products){
      ids.push(product.node.legacyResourceId);
    }
    console.log('Sequence id:');
    for(let id of ids){
      console.log(id+"\n");
    }
    afterCursor = productsData.collection.products.pageInfo.endCursor;
    hasNextPage = productsData.collection.products.pageInfo.hasNextPage;
  }
  
  return {
    collectionId: collectionId,
    products: products
  }
};

export const action = async ({ request}: ActionFunctionArgs) => {
  console.log("Action Triggered.");
  const {admin} = await authenticate.admin(request);

  if(!admin) {
    throw new Error('admin not authenticated!');
  }

  const formData = await request.formData();
  console.dir(`Action triggered: ${formData}`);
  const collectionId = formData.get("id") as string | null;
  const moves = formData.get("moves") as string;
  console.log(`collection Id: ${collectionId}`);
  console.log(`Moves: ${moves}`);

  const response: any = await admin.graphql(`
    #graphql
    mutation collectionReorderProducts($id: ID!, $moves: [MoveInput!]!) {
      collectionReorderProducts(id: $id, moves: $moves) {
        job {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
  {
    variables: {
      id: collectionId,
      moves: JSON.parse(moves),
    },
  },

).catch(e=>{console.log(e.response)})

const responseData: any = await response.json();
// console.log(responseData);
console.log("responseData.data.collectionReorderProducts.job",responseData.data.collectionReorderProducts.job)

console.log("responseData.data.collectionReorderProducts.userErrors",responseData.data.collectionReorderProducts.userErrors)


return {JobId: responseData.data.collectionReorderProducts.userErrors}
}

export default function VMId() {
  const { collectionId, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [reorderData, setReorderData] = useState(products);
  console.log(products);
  // console.log('fetcher: ', fetcher);
  const handleReorder = () => {
    const moves = reorderData.map((product, index) => ({
      id: product.node.id,
      newPosition: (index + 1).toString(),
    }));

    const movesValue = JSON.stringify(moves);

    fetcher.submit(
      {
        id: collectionId, 
        moves: movesValue, 
      },
      { method: "POST", encType: "application/json" }
    );
  };
  return (
    <AppProvider i18n={{}}>
      <Page>
        <Card>
          {products.map((product: any) => (
            <MediaCard
              portrait
              title={product.node.title}
              key={product.node.id}
              description={product.node.title}
              primaryAction={{
                content: 'Learn more',
                onAction: () => {},
              }}
            >
              <img
                alt=""
                width="200px"
                height="200px"
                style={{ objectFit: 'cover', objectPosition: 'center' }}
                src="https://burst.shopifycdn.com/photos/business-woman-smiling-in-office.jpg?width=1850"
              />
            </MediaCard>
          ))}
        </Card>
        <fetcher.Form method='POST'>
          <input type="hidden" name="id" value={collectionId} />
          <input
            type='hidden'
            name='moves'
            value={JSON.stringify([
              {id: "gid://shopify/Product/7847532003402", newPosition: "0"},
              {id: "gid://shopify/Product/7847531511882", newPosition: "1"}
            ])}
          /> 
          <div style={{ padding: "16px" }}>
            <button onClick={handleReorder}>Reorder Products</button>
          </div>
        </fetcher.Form>
        {fetcher.data?.JobId && (
          <p>Reorder Job ID: {fetcher.data.JobId}</p>
        )}
      </Page>
    </AppProvider>
  );
}
