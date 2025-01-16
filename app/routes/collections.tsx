import type {LoaderFunction, LoaderFunctionArgs} from "@remix-run/node";
import {authenticate} from "../shopify.server";
import {useLoaderData, Link} from "@remix-run/react";

export const loader: LoaderFunction = async ({request}: LoaderFunctionArgs) => {
  const {admin} = await authenticate.admin(request);

  // let hasNextPage: boolean = true;
  // let afterCursor: string | null = null;
  let collections: string[] = [];
  //
  // while (hasNextPage) {
    const collectionQuery: any = await admin.graphql(`
      #graphql
        query getAllCollections($after: String) {
          collections(first: 250, after: $after) {
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
            }
          }
        }
    `,
      {
        variables: {
          after: null
        }
      }
      );

    const collectionResponse: any = await collectionQuery.json();
    // console.log(collectionResponse.data.collections.nodes);
    collections.push(...collectionResponse.data.collections.nodes);
    console.log(collections);

  // }

  return {collections}
}

export default function Collections() {
  const data: any = useLoaderData<typeof loader>();
  console.log(data);
  return (
    <div>
      <h1>Collections</h1>
      <ul>
        {data.collections.map((collection: any) => (
          <li key={collection.legacyResourceId}>
            <Link to={`/collection/${collection.legacyResourceId}`}>
              {collection.image && <img src={collection.image.url} alt={collection.image.altText} className="collection-image"/>}
              <p>{collection.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
