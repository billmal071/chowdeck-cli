// How the CLI talks to Chowdeck. The mock provider lets the agent flow be built
// and tested before a real integration exists. Prices are whole naira.

export interface Vendor {
  id: string;
  name: string;
  cuisine: string;
  open: boolean;
  eta_min: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface CartLine {
  item_id: string;
  name: string;
  qty: number;
  unit_price: number;
}

export interface Cart {
  vendor_id: string;
  lines: CartLine[];
}

export interface Quote {
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  eta_min: number;
  /** Delivery address as the provider resolved it, so the user can verify it. */
  address?: string;
  /** Caveats about the numbers, e.g. fees that are only known at checkout. */
  note?: string;
}

export interface Order {
  id: string;
  vendor_id: string;
  address: string;
  total: number;
  status: string;
  placed_at: string;
}

export interface Provider {
  search(query: string): Promise<Vendor[]>;
  menu(vendorId: string): Promise<{ vendor: Vendor; items: MenuItem[] }>;
  quote(cart: Cart, address: string): Promise<Quote>;
  place(cart: Cart, address: string): Promise<Order>;
  status(orderId: string): Promise<Order>;
  close?(): Promise<void>;
}
