import {useLoaderData, useFetcher} from "@remix-run/react";
import type {LoaderFunctionArgs, ActionFunctionArgs} from "@remix-run/node";
import type {InventoryPolicy} from "../enum/Enum";
import {authenticate} from "../shopify.server";
import {AppProvider, Card, MediaCard, Page} from "@shopify/polaris";
import type ProductInterface from "../interface/ProductInterface";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

function checkVariantStock(inventoryItemTracked: boolean, inventoryQuantity: number, inventoryPolicy: InventoryPolicy): boolean {
  let isInStock: boolean;
  if (inventoryItemTracked) {
    if (inventoryQuantity > 0)
      isInStock = true;
    else
      isInStock = inventoryPolicy !== 'DENY';
  }else
    isInStock = true;

  return isInStock;
}


/*--------------------------Loader Function Started--------------------------------*/


export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id } = params;
  const { admin } = await authenticate.admin(request);

  const collectionId = `gid://shopify/Collection/${id}`;
  const productData: Record<string, ProductInterface> = {};
  let productsArray: ProductInterface[] = [];

  const fetchProducts = async () => {
    const products: any[] = [];
    let afterCursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: any = await admin.graphql(`
        query GetCollectionProducts($id: ID!, $after: String) {
          collection(id: $id) {
            products(first: 50, after: $after) {
              edges {
                node {
                  legacyResourceId
                  title
                  handle
                  vendor
                  productType
                  tags
                  featuredMedia {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                  createdAt
                  updatedAt
                  publishedAt
                  totalInventory
                  variantsCount {
                    count
                  }
                  tracksInventory
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `, { variables: {id: collectionId, after: afterCursor} });

      const data = (await response.json()).data.collection.products;
      products.push(...data.edges.map((edge: any) => edge.node));
      afterCursor = data.pageInfo.endCursor;
      hasNextPage = data.pageInfo.hasNextPage;
    }

    return products;
  };

  const fetchVariants = async (productIds: string[]) => {
    const variants: any[] = [];
    let afterCursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: any = await admin.graphql(`
        query GetProductVariants($after: String, $query: String) {
          productVariants(first: 50, query: $query, after: $after) {
            nodes {
              title
              legacyResourceId
              inventoryQuantity
              price
              sku
              compareAtPrice
              inventoryPolicy
              inventoryItem {
                tracked
              }
              product {
                legacyResourceId
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {variables: { after: afterCursor, query: `product_ids:${productIds.join(',')}` }});

      const data = (await response.json()).data.productVariants;
      variants.push(...data.nodes);
      afterCursor = data.pageInfo.endCursor;
      hasNextPage = data.pageInfo.hasNextPage;
    }

    return variants;
  };

  // Fetch products and variants concurrently
  const products: any[] = await fetchProducts();
  const productIds: string[] = products.map(product => product.legacyResourceId);
  const variants: any[] = await fetchVariants(productIds);

  for (const product of products) {
    const pId: string = product.legacyResourceId;

    productData[pId] = {
      productId: pId,
      title: product.title,
      handle: product.handle,
      isInStock: false,
      isInStockWithBO: false,
      price: 0,
      image: { url: product.featuredMedia?.preview.image.url || '' },
      variantsInventory: {},
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      publishedAt: product.publishedAt,
      createdAtTimestamp: dayjs(product.createdAt).utc().unix(),
      updatedAtTimestamp: dayjs(product.updatedAt).utc().unix(),
      publishedAtTimestamp: product.publishedAt
        ? dayjs(product.publishedAt).utc().unix()
        : null,
      totalInventory: 0,
      variantsCount: product.variantsCount.count,
      tracksInventory: product.tracksInventory,
      variantsInventoryArray: [],
      variantsStockRatio: 0,
      absoluteDiscount: 0,
      percentageDiscount: 0,
      variantsWithBOStockRatio: 0,
    };
  }

  for (const variant of variants) {
    let variantsWithStock: number = 0;
    const productId: string = variant.product.legacyResourceId;
    if (!productData[productId]) continue;

    let isInStock: boolean = checkVariantStock(
      variant.inventoryItem.tracked,
      variant.inventoryQuantity,
      variant.inventoryPolicy
    );

    productData[productId].variantsInventory[variant.sku] = {
      title: variant.title,
      inventory: variant.inventoryQuantity,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice || variant.price,
    };

    productData[productId].totalInventory += variant.inventoryQuantity;
    productData[productId].variantsInventoryArray.push(variant.inventoryQuantity);

    if (isInStock) {
      const minPrice: number = Math.min(productData[productId].price || Number.MAX_SAFE_INTEGER, variant.price);
      productData[productId].price = minPrice;
      productData[productId].absoluteDiscount = (variant.compareAtPrice || minPrice) - minPrice;
      productData[productId].percentageDiscount = parseFloat(
        ((productData[productId].absoluteDiscount / (variant.compareAtPrice || minPrice)) * 100).toFixed(2)
      );
      productData[productId].isInStock = true;
      variantsWithStock++;
    }

    if (variant.inventoryQuantity > 0) {
      productData[productId].isInStockWithBO = true;
    }
    console.log(`${productId}: ${variantsWithStock}`)
    productData[productId].variantsStockRatio = parseFloat(
      ((variantsWithStock / productData[productId].variantsCount) * 100).toFixed(2)
    );

    const stockCount: number = productData[productId].variantsInventoryArray.filter(inv => inv > 0).length;
    // productData[productId].variantsStockRatio = parseFloat(
    //   ((stockCount / productData[productId].variantsCount) * 100).toFixed(2)
    // );
    productData[productId].variantsWithBOStockRatio = parseFloat(
      ((productData[productId].totalInventory > 0 ? stockCount : 0) / productData[productId].variantsCount * 100).toFixed(2)
    );
  }

  productsArray = Object.values(productData);
  console.dir(productsArray, {depth: null});
  return {
    collectionId,
    products: productsArray,
  };
};


/*-------------------Action function started------------------*/


export const action = async ({request}: ActionFunctionArgs) => {
  console.log("Action Triggered.");
  const {admin} = await authenticate.admin(request);

  if (!admin) {
    throw new Error('admin not authenticated!');
  }

  const formData = await request.formData();
  console.log(`Action triggered: ${formData}`);
  const collectionId = formData.get("id") as string;
  const movesString = formData.get("moves") as string;
  console.log(`collection Id: ${collectionId}`);
  console.log(`Moves: ${movesString}`);

  const moves = JSON.parse(movesString) as { id: string; newPosition: string }[];
  //console.log(moves);
  const MAX_MOVES_PER_REQUEST: number = 10;

  const moveBatches: any[] = [];
  for (let i: number = 0; i < moves.length; i += MAX_MOVES_PER_REQUEST) {
    moveBatches.push(moves.slice(i, i + MAX_MOVES_PER_REQUEST));
    console.log('Moves: ', moveBatches);
  }

  const jobIds: string[] = [];

  for (const batch of moveBatches) {
    try {
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
            moves: batch,
          },
        },
      )

      const responseData: any = await response.json();
      const jobId: string = responseData.data.collectionReorderProducts.job.id;
      jobIds.push(jobId);
      //console.log(jobIds);
    } catch (err) {
      console.error(err);
    }
  }

  return null;
}

export default function Products() {
  const {collectionId, products} = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  // console.log(products);
  const handleReorder: any = () => {
  };

  return (
    <AppProvider i18n={{}}>
      <Page>
        <Card>
          {products.map((product: any) => (
            <MediaCard
              portrait
              title={product.title}
              key={product.id}
              description={product.title}
              primaryAction={{
                content: 'Load more',
                onAction: () => {
                },
              }}
            >
              <img
                width="200px"
                height="200px"
                style={{objectFit: 'cover', objectPosition: 'center'}}
                src={product.image.url}
                alt={product.image.altText}
              />
            </MediaCard>
          ))}
        </Card>
        <fetcher.Form method='POST'>
          <input type="hidden" name="id" value={collectionId}/>
          <input
            type='hidden'
            name='moves'
            value={JSON.stringify([
              {id: "gid://shopify/Product/6933515698248", newPosition: "1"},
              {id: "gid://shopify/Product/6933515468872", newPosition: "1"},
              {id: "gid://shopify/Product/6933515665480", newPosition: "1"},
              {id: "gid://shopify/Product/6933517074504", newPosition: "1"},
              {id: "gid://shopify/Product/6933514977352", newPosition: "1"},
              {id: "gid://shopify/Product/6933517598792", newPosition: "1"}
            ])}
          />
          <div style={{padding: "16px"}}>
            <button onClick={handleReorder}>Reorder Products</button>
          </div>
        </fetcher.Form>
      </Page>
    </AppProvider>
  )
}
