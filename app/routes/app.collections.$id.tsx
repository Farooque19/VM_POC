import {useLoaderData, useFetcher, useNavigate} from "@remix-run/react";
import type {NavigateFunction} from "@remix-run/react";
import type {LoaderFunctionArgs, ActionFunctionArgs} from "@remix-run/node";
import type {InventoryPolicy} from "../enum/Enum";
import {authenticate} from "../shopify.server";
import {AppProvider, Card, MediaCard, Page, Pagination} from "@shopify/polaris";
import type ProductInterface from "../interface/ProductInterface";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {useMemo} from "react";
import type {PageInfo} from "../interface/PageInfoInterface";

dayjs.extend(utc);

function checkVariantStock(inventoryItemTracked: boolean, inventoryQuantity: number, inventoryPolicy: InventoryPolicy): boolean {
  if (!inventoryItemTracked) return true;
  return inventoryQuantity > 0 || inventoryPolicy !== 'DENY';
}


/*--------------------------Loader Function Started--------------------------------*/


export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const id: any = params.id;
  const {admin} = await authenticate.admin(request);
  const url = new URL(request.url);
  const searchParam: URLSearchParams = url.searchParams;
  const rel: string | null = searchParam.get('rel');
  const cursor: string | null = searchParam.get('cursor');

  let searchStrings: string = `first: 50`;

  if (rel === "next" && cursor) {
    searchStrings = `first: 50, after: "${cursor}"`;
  } else if (rel === "previous" && cursor) {
    searchStrings = `last: 50, before: "${cursor}"`;
  }

  const collectionId = `gid://shopify/Collection/${id}`;
  const productData: Record<string, ProductInterface> = {};
  let productsArray: ProductInterface[];

  const products: any[] = [];
  try {
    const response: Response = await admin.graphql(`
        query GetCollectionProducts($id: ID!) {
          collection(id: $id) {
            products(${searchStrings}) {
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
                hasPreviousPage
                startCursor
              }
            }
          }
        }
      `, {
        variables: {
          id: collectionId
        }
      }
    );
    const responseData = await response.json();
    const data = responseData.data.collection.products;
    products.push(...data.edges.map((edge: any) => edge.node));
    const pageInfo: PageInfo = data.pageInfo;

    async function fetchVariants(productIds: string[], retries: number, delay: number): Promise<any[]> {
      const variants: any[] = [];
      let afterCursor: string | null = null;
      let hasNextPage: boolean = true;

      try {
        while (hasNextPage) {
          const response: Response = await admin.graphql(`
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
      `, {
              variables: {
                after: afterCursor,
                query: `product_ids:${productIds.join(',')}`
              }
            }
          );
          const data = (await response.json()).data.productVariants;
          variants.push(...data.nodes);
          afterCursor = data.pageInfo.endCursor;
          hasNextPage = data.pageInfo.hasNextPage;
        }
      } catch (error) {
        if (retries > 0) {
          console.log(`Waiting for ${delay / 1000} seconds before retrying...Retry ${retries - 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return await fetchVariants(productIds, retries - 1, delay);
        }
        throw new Error(`Error occurred! Failed to fetch variants: ${error}`);
      }

      return variants;
    }

    const productIds: string[] = products.map(product => product.legacyResourceId);
    const variants: any[] = await fetchVariants(productIds, 3, 10000);

    for (const product of products) {
      const pId: string = product.legacyResourceId;
      let variantsWithStock: number = 0;

      productData[pId] = {
        productId: pId,
        title: product.title,
        handle: product.handle,
        isInStock: false,
        isInStockWithBO: false,
        price: 0,
        image: {url: product.featuredMedia?.preview.image.url || ''},
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

      const variantsForProduct: any[] = variants.filter(variant => variant.product.legacyResourceId === pId);

      for (const variant of variantsForProduct) {

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

        const minPrice: number = Math.min(productData[productId].price || Number.MAX_SAFE_INTEGER, variant.price);
        productData[productId].price = minPrice;
        productData[productId].absoluteDiscount = (variant.compareAtPrice || minPrice) - minPrice;
        productData[productId].percentageDiscount = parseFloat(
          ((productData[productId].absoluteDiscount / (variant.compareAtPrice || minPrice)) * 100).toFixed(2)
        );

        if (isInStock) {
          productData[productId].isInStock = true;
          variantsWithStock++;
        }

        if (variant.inventoryQuantity > 0) {
          productData[productId].isInStockWithBO = true;
        }

        productData[productId].variantsStockRatio = parseFloat(
          ((variantsWithStock / productData[productId].variantsCount) * 100).toFixed(2)
        );

        const stockCount: number = productData[productId].variantsInventoryArray.filter(inv => inv > 0).length;

        productData[productId].variantsWithBOStockRatio = parseFloat(
          ((productData[productId].totalInventory > 0 ? stockCount : 0) / productData[productId].variantsCount * 100).toFixed(2)
        );

      }
    }
    productsArray = Object.values(productData);
    return {
      collectionId: collectionId,
      products: productsArray,
      pageInfo: pageInfo
    };
  } catch (error) {
    throw new Error(`Failed to load collection: ${error}`);
  }
};


/*-------------------Action function started------------------*/


export const action = async ({request}: ActionFunctionArgs) => {
  const {admin} = await authenticate.admin(request);

  if (!admin) {
    throw new Error('admin not authenticated!');
  }

  const formData = await request.formData();
  const collectionId = formData.get("id") as string;
  const movesString = formData.get("moves") as string;

  const moves = JSON.parse(movesString) as { id: string; newPosition: string }[];
  const MAX_MOVES_PER_REQUEST: number = 250;

  const moveBatches: any[] = [];
  for (let i: number = 0; i < moves.length; i += MAX_MOVES_PER_REQUEST) {
    moveBatches.push(moves.slice(i, i + MAX_MOVES_PER_REQUEST));
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
      console.log(jobIds);
    } catch (err) {
      console.error(err);
    }
  }

  return null;
}

export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const navigate: NavigateFunction = useNavigate();
  const products = loaderData.products;
  const collectionId: string = loaderData.collectionId;
  const numericalId: string = collectionId.split('/').pop() as string;
  const pageInfo: any = loaderData.pageInfo;
  const pagination = useMemo(() => {
    const {hasNextPage, hasPreviousPage, startCursor, endCursor} = pageInfo || {};

    return {
      previous: {
        disabled: !hasPreviousPage || !startCursor,
        link: hasPreviousPage && startCursor ? `/app/collections/${numericalId}?rel=previous&cursor=${startCursor}` : null,
      },
      next: {
        disabled: !hasNextPage || !endCursor,
        link: hasNextPage && endCursor ? `/app/collections/${numericalId}?rel=next&cursor=${endCursor}` : null,
      },
    };
  }, [numericalId, pageInfo]);

  const fetcher = useFetcher<typeof action>();
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
              <div style={{padding: '8px 0'}}>
                <strong>Price: </strong>
                <span>${product.price}</span>
              </div>
              {product.vendor && (
                <div style={{padding: '8px 0'}}>
                  <strong>Vendor: </strong>
                  <span>{product.vendor}</span>
                </div>
              )}
              {product.productType && (
                <div style={{padding: '8px 0'}}>
                  <strong>Type: </strong>
                  <span>{product.productType}</span>
                </div>
              )}
              {product.tags && (
                <div style={{padding: '8px 0'}}>
                  <strong>Tags: </strong>
                  <span>{product.tags.join(', ')}</span>
                </div>
              )}
            </MediaCard>
          ))}
          <div className="navigation">
            <Pagination
              hasPrevious={!pagination.previous.disabled}
              onPrevious={() => {
                if (pagination.previous.link) {
                  navigate(pagination.previous.link);
                }
              }}
              hasNext={!pagination.next.disabled}
              onNext={() => {
                if (pagination.next.link) {
                  navigate(pagination.next.link);
                }
              }}
            />
          </div>
        </Card>
        <fetcher.Form method='POST'>
          <input type="hidden" name="id" value={collectionId}/>
          <input
            type='hidden'
            name='moves'
            value={JSON.stringify([
              {id: "gid://shopify/Product/6933515698248", newPosition: "0"},
              {id: "gid://shopify/Product/6933515468872", newPosition: "2"},
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
