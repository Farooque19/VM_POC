import {
  IndexTable,
  LegacyCard,
  Text,
  Page, Button, Pagination,
} from '@shopify/polaris';
import type {PageInfo} from "../interface/PageInfoInterface";
import type {LoaderFunction, LoaderFunctionArgs} from "@remix-run/node";
import {authenticate} from 'app/shopify.server';
import {useLoaderData, Link, useNavigate} from '@remix-run/react';
import type {NavigateFunction} from '@remix-run/react';
import {useMemo} from "react";

export const loader: LoaderFunction = async ({request}: LoaderFunctionArgs) => {
  const {admin} = await authenticate.admin(request);
  const url = new URL(request.url);
  const searchParam: URLSearchParams = url.searchParams;
  const rel: string | null = searchParam.get('rel');
  const cursor: string | null = searchParam.get('cursor');

  let searchString: string = `first: 10`;

  if (rel === "next" && cursor) {
    searchString = `first: 10, after: "${cursor}"`;
  } else if (rel === "previous" && cursor) {
    searchString = `last: 10, before: "${cursor}"`;
  }

  let collections: string[] = [];

  try {
    const collectionQuery: Response = await admin.graphql(`
      #graphql
        query getAllCollections {
          collections(${searchString}) {
            nodes {
              legacyResourceId
              id
              title
              handle
              image {
                altText
                url
              }
              updatedAt
            }
            pageInfo {
              hasNextPage
              endCursor
              hasPreviousPage
              startCursor
            }
          }
        }`
    );

    const collectionResponse: any = await collectionQuery.json();
    collections.push(...collectionResponse.data.collections.nodes);

    return {
      collectionsData: collections,
      pageInfo: collectionResponse.data.collections.pageInfo,
    }
  } catch (e) {
    throw new Error(`Error occurred while getting collections: ${e}`);
  }
}
export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const collections = loaderData.collectionsData;
  const pageInfo: PageInfo = loaderData.pageInfo;
  const navigate: NavigateFunction = useNavigate();
  const pagination = useMemo(() => {
    const {hasNextPage, hasPreviousPage, startCursor, endCursor} = pageInfo || {};

    return {
      previous: {
        disabled: !hasPreviousPage || !startCursor,
        link: hasPreviousPage && startCursor ? `/app/?rel=previous&cursor=${startCursor}` : null,
      },
      next: {
        disabled: !hasNextPage || !endCursor,
        link: hasNextPage && endCursor ? `/app/?rel=next&cursor=${endCursor}` : null,
      },
    };
  }, [pageInfo]);
  const rowMarkup = collections.map((collection: any, index: number) => (
    <IndexTable.Row
      id={collection.legacyResourceId}
      key={collection.legacyResourceId}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {collection.legacyResourceId}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{collection.title}</IndexTable.Cell>
      <IndexTable.Cell> <Link to={`/app/collections/${collection.legacyResourceId}`}>
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

    </Page>
  )

}
