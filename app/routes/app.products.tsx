import {Layout, Page, Card, Text, Box, ResourceList, Thumbnail, ResourceItem} from '@shopify/polaris';
import type {LoaderFunctionArgs} from "@remix-run/node";
import {authenticate} from 'app/shopify.server';
import {ProductIcon} from '@shopify/polaris-icons';
import {useLoaderData} from '@remix-run/react';

export const loader = async ({request}: LoaderFunctionArgs) => {
// let hasNextPage: boolean = true;
// let afterCursor: string | null = null;

// while (hasNextPage) {
//
// }
  const {admin} = await authenticate.admin(request)
  const response: any = await admin.graphql(`#graphql
        query fetchProducts {
            products(first: 10) {
                edges {
                  node {
                    id
                    title
                    featuredMedia {
                      alt
                      preview {
                        image {
                          url
                        }
                      }
                    }
                    handle
                    hasVariantsThatRequiresComponents
                    hasOutOfStockVariants
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
            }
        }`);

  const productsData = await response.json();
  console.log(productsData);
  return {
    products: productsData.data.products.edges
  }

}
export default function Products() {
  const {products} = useLoaderData<typeof loader>();
  console.log(products)
  const renderMedia = (image: any) => {
    return image ? <Thumbnail source={image.preview.image.url} alt='product' size="small"></Thumbnail> :
      <Thumbnail source={ProductIcon} alt='product' size="small"></Thumbnail>
  }
  const renderItem = (item: typeof products[number]) => {
    const {id, title, handle, featuredMedia} = item.node
    return (

      <ResourceItem id={id}
                    url={handle}
                    media={renderMedia(featuredMedia)}
      >
        <Text as='h5' variant='bodyMd'>{title}</Text>
        <div>{handle}</div>
      </ResourceItem>
    )
  }
  return (
    <Page>
      <ui-title-bar title="Visual Merchandising">
        <button variant="primary" onClick={() => shopify.modal.show('product-modal')}>Create a new product</button>
      </ui-title-bar>

      <ui-modal id='product-modal'>
        <ui-title-bar title="Product Info">
          <button variant="primary" onClick={() => shopify.modal.hide('product-modal')}>OK</button>
        </ui-title-bar>
        <Box padding='500'>
          This will you will see product info
        </Box>
      </ui-modal>
      <Layout>
        <Layout.Section>
          <Card>
            <ResourceList resourceName={{singular: "Product", plural: "Products"}}
                          items={products} renderItem={renderItem}></ResourceList>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
