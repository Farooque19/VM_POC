import {
  IndexTable,
  LegacyCard,
  Text,
  Page, Button,
} from '@shopify/polaris';

import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from 'app/shopify.server';
import { useLoaderData, json, Link } from '@remix-run/react';
export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { admin } = await authenticate.admin(request)
  const response = await admin.graphql(`#graphql
        query FetchAllCollections {
  collections(first: 50) {
    edges {
      node {
        legacyResourceId
        title
        handle
        updatedAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`)

  const collectionsData = (await response.json()).data
  
  return {
    collections: collectionsData.collections.edges
  }

}
export default function Products() {
  const { collections } = useLoaderData<typeof loader>();
  console.log(collections)
  const rowMarkup = collections.map((collection: any, index: number) => (
    <IndexTable.Row
      id={collection.node.legacyResourceId}
      key={collection.node.legacyResourceId}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {collection.node.legacyResourceId}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{collection.node.title}</IndexTable.Cell>
      <IndexTable.Cell> <Link to={`/vm/${collection.node.legacyResourceId}`}>
        <Button>VM</Button>
      </Link></IndexTable.Cell>
    </IndexTable.Row>
  ))
  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };
  return (
    <Page fullWidth>
      <LegacyCard>
        <IndexTable
          resourceName={resourceName}
          itemCount={collections.length}
          headings={[
            {title: 'S.no'},
            {title: 'Collection'},
            {title: 'Action'},
          ]}
        >
          {rowMarkup}
        </IndexTable>
      </LegacyCard>
    </Page>
  )

}
