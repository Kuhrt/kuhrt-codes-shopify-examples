export const HISTORY_DAYS = 60;
export const DEMO_ORDER_TAG = 'reorder-demo';
export const DEMO_LOCATION_NAME = 'Demo warehouse';
export const REQUIRED_LOCATIONS = 2;

export interface DemoProduct {
  handle: string;
  title: string;
  sku: string;
  price: string;
  /** Available units at the first and second location. */
  stock: readonly [number, number];
  /** Units sold on the day that many days before today. */
  unitsSold: (ageInDays: number) => number;
}

const SEASONAL_SHIFT_AGE = 30;

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    handle: 'reorder-demo-water-bottle',
    title: 'Insulated Water Bottle',
    sku: 'RD-FAST-1',
    price: '18.00',
    stock: [25, 15],
    unitsSold: () => 6
  },
  {
    handle: 'reorder-demo-tote-bag',
    title: 'Canvas Tote Bag',
    sku: 'RD-STEADY-1',
    price: '24.00',
    stock: [80, 40],
    unitsSold: () => 2
  },
  {
    handle: 'reorder-demo-desk-planter',
    title: 'Ceramic Desk Planter',
    sku: 'RD-SLOW-1',
    price: '32.00',
    stock: [150, 100],
    unitsSold: (age) => (age % 5 === 0 ? 1 : 0)
  },
  {
    handle: 'reorder-demo-winter-gloves',
    title: 'Fleece Winter Gloves',
    sku: 'RD-SEASONAL-1',
    price: '45.00',
    stock: [6, 4],
    unitsSold: (age) => (age <= SEASONAL_SHIFT_AGE ? 1 : 8)
  }
];
