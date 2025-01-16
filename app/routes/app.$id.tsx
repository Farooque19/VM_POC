import { ActionFunction, redirect, ActionFunctionArgs } from "@remix-run/node";
import {authenticate} from "../shopify.server";
import {
  Button,
  Card,
  Layout,
  Page,
  Popover,
  ResourceListProps,
  Text,
} from "@shopify/polaris";
import {useState, useCallback} from "react";
import {useActionData, useSubmit} from "@remix-run/react";

type Props = {};

export const action: ActionFunction = async ({request, params}: ActionFunctionArgs) => {
  const {admin} = await authenticate.admin(request);
  const {id} = params;
  const collectionId: string = `gid://shopify/Collection/${id}`
  const formData = await request.formData();

  const response: any = await admin.graphql(`
    #graphql
        mutation {
          bulkOperationRunQuery(
            query: """
            {
              collection(id: ${collectionId}) {
                id
                handle
                title
                updatedAt
                products {
                  edges {
                    node {
                      id
                      title
                      handle
                      vendor
                      productType
                      tags
                      totalInventory
                      tracksInventory
                      featuredMedia {
                        preview {
                          image {
                            altText
                            url
                          }
                        }
                      }
                      createdAt
                      updatedAt
                      publishedAt
                      variants {
                        edges {
                          node {
                            id
                            title
                            inventoryQuantity
                            price
                            compareAtPrice
                            inventoryPolicy
                            inventoryItem {
                              tracked
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            """
          ) {
            bulkOperation {
              id
              status
              url
            }
            userErrors {
              field
              message
            }
          }
        }
  `);



  if (response.ok) {
    const data = await response.json();
    console.log(`Response is: ${data}`);
    console.log("Data: ", data.data.bulkOperationRunQuery.bulkOperation);

    return redirect("/app/exportresult");
  }

  return null;
}
export default function ExportForm (props: Props) {
  const [activate, setActivate] = useState(false);

  const [selectedItems, setSelectedItems] = useState<ResourceListProps["selectedItems"]>([]);

  const toggleActive = useCallback(() =>
  setActivate((activate) => !activate),
    [],
    );

  const submit= useSubmit();
  const actionData = useActionData<typeof action>();
  console.log(`Action Data: ${actionData}`);

  const createExport = () => {
    submit(
      {},
      {
        replace: true,
        method: "POST",
        action: "/app/exportform",
      },
    );
  };

  return (
    <Page>
      <ui-title-bar title="Products and variants">
        <button variant="primary" onClick={createExport}>
          Show Products
        </button>
      </ui-title-bar>
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="p" fontWeight="bold">
              Products
            </Text>
          </Card>
          <br />
          {/*<Card>*/}
          {/*  <div style={{position: "relative"}}>*/}
          {/*    */}
          {/*  </div>*/}
          {/*</Card>*/}
        </Layout.Section>
      </Layout>
    </Page>
)
}
