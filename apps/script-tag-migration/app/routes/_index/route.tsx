import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.has('shop')) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return null;
};

export default function Index() {
  return (
    <main>
      <h1>Script tag migration</h1>
      <p>
        This app runs inside the Shopify admin. Install it from your store to open the migration
        console.
      </p>
    </main>
  );
}
