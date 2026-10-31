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
  /** True when the menu shows a "From" price. Other items can still have options: see `options`. */
  has_options?: boolean;
}

export interface OptionChoice {
  name: string;
  /** Extra naira this choice adds. */
  price: number;
}

/** A group of choices on an item, e.g. "Size" (required, pick 1) or "Extras" (optional, up to 2). */
export interface OptionGroup {
  name: string;
  required: boolean;
  min: number;
  max: number;
  choices: OptionChoice[];
}

export interface CartLine {
  item_id: string;
  name: string;
  qty: number;
  /** Price of one unit including the chosen options. */
  unit_price: number;
  /** Chosen options as "Group=Choice". */
  options?: string[];
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
  /** Part of the subtotal that is packaging the vendor adds automatically (e.g. a take-away pack). */
  packaging?: number;
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
  /** The option groups of an item; empty if it has none. */
  itemOptions?(vendorId: string, itemId: string): Promise<OptionGroup[]>;
  close?(): Promise<void>;
}
