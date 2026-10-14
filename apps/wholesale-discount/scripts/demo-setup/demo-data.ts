export const WHOLESALE_TAG = 'wholesale';
export const ONLINE_STORE_PUBLICATION = 'Online Store';

export interface DemoProduct {
  handle: string;
  title: string;
  optionName: string;
  optionValues: string[];
  price: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    handle: 'wholesale-demo-t-shirt',
    title: 'Wholesale Demo T-Shirt',
    optionName: 'Size',
    optionValues: ['S', 'M', 'L'],
    price: '40.00'
  },
  {
    handle: 'wholesale-demo-cap',
    title: 'Wholesale Demo Cap',
    optionName: 'Colour',
    optionValues: ['Black', 'Navy', 'Sand'],
    price: '25.00'
  }
];
