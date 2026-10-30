import type { Cart, MenuItem, Order, Provider, Quote, Vendor } from "./provider.js";

const vendors: Vendor[] = [
  { id: "v1", name: "Mama Put Kitchen", cuisine: "Nigerian", open: true, eta_min: 35 },
  { id: "v2", name: "Burger Barn", cuisine: "Fast food", open: true, eta_min: 25 },
  { id: "v3", name: "Suya Spot", cuisine: "Grill", open: false, eta_min: 40 },
];

const menus: Record<string, MenuItem[]> = {
  v1: [
    { id: "m1", name: "Jollof rice and chicken", price: 4500, available: true },
    { id: "m2", name: "Egusi and pounded yam", price: 5200, available: true },
    { id: "m3", name: "Moin moin", price: 1200, available: false },
  ],
  v2: [
    { id: "m4", name: "Classic burger", price: 4000, available: true },
    { id: "m5", name: "Fries", price: 1500, available: true },
  ],
  v3: [{ id: "m6", name: "Beef suya", price: 3000, available: true }],
};

/** In-memory provider with canned vendors. It never places real orders. */
export class MockProvider implements Provider {
  async search(query: string): Promise<Vendor[]> {
    const q = query.toLowerCase();
    return vendors.filter((v) => !q || `${v.name} ${v.cuisine}`.toLowerCase().includes(q));
  }

  async menu(vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) throw new Error(`vendor "${vendorId}" not found`);
    return { vendor, items: menus[vendorId] ?? [] };
  }

  async quote(cart: Cart, _address: string): Promise<Quote> {
    const { vendor } = await this.menu(cart.vendor_id);
    if (!vendor.open) throw new Error(`vendor "${vendor.name}" is closed`);
    const subtotal = cart.lines.reduce((n, l) => n + l.unit_price * l.qty, 0);
    const delivery_fee = 1000;
    const service_fee = Math.floor(subtotal / 20);
    return {
      subtotal,
      delivery_fee,
      service_fee,
      total: subtotal + delivery_fee + service_fee,
      eta_min: vendor.eta_min,
    };
  }

  async place(cart: Cart, address: string): Promise<Order> {
    const q = await this.quote(cart, address);
    return {
      id: `mock-${Date.now()}`,
      vendor_id: cart.vendor_id,
      address,
      total: q.total,
      status: "preparing",
      placed_at: new Date().toISOString(),
    };
  }

  async status(orderId: string): Promise<Order> {
    return { id: orderId, vendor_id: "", address: "", total: 0, status: "on_the_way", placed_at: "" };
  }
}
