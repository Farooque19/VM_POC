import { useParams } from '@remix-run/react';
import { Page, Text } from '@shopify/polaris';

export default function CollectionDetail() {
  const { id } = useParams();

  return (
    <Page>
      <Text as='span' variant="headingMd">Collection ID: {id}</Text>
      {/* Add more details or functionality here */}
    </Page>
  );
}
