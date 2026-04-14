import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { MapPin, Plus, Truck, CreditCard, Banknote, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

export default function CheckoutPage() {
  const { customer } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [addresses, setAddresses] = useState<Array<Record<string, unknown>>>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingMethods, setShippingMethods] = useState<Array<Record<string, unknown>>>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"online" | "cod">("online");
  const [placing, setPlacing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);

  const [newAddress, setNewAddress] = useState({
    full_name: "", phone_number: "", address_line1: "", address_line2: "",
    landmark: "", city: "", state: "", postal_code: "", address_type: "home",
  });

  useEffect(() => {
    if (!customer?.id) return;
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .then(({ data }) => {
        if (data) {
          setAddresses(data);
          const def = data.find((a) => a.is_default) || data[0];
          if (def) setSelectedAddressId(def.id as string);
        }
      });

    supabase
      .from("shipping_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setShippingMethods(data);
          if (data.length > 0) setSelectedMethodId(data[0].id as string);
        }
      });
  }, [customer?.id]);

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to continue</h2>
        <p className="text-gray-500 mb-6">Please sign in to proceed with checkout.</p>
        <Link href="/auth" className="inline-flex px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600">
          Sign In
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
        <Link href="/products" className="text-amber-600 hover:text-amber-700 font-medium">Browse Products</Link>
      </div>
    );
  }

  const selectedMethod = shippingMethods.find((m) => m.id === selectedMethodId);
  const shippingCost = selectedMethod ? Number(selectedMethod.base_rate || 0) : 0;
  const freeShipping = selectedMethod && selectedMethod.free_above_amount && subtotal >= Number(selectedMethod.free_above_amount);
  const actualShipping = freeShipping ? 0 : shippingCost;
  const tax = subtotal * 0.18;
  const codFee = paymentMode === "cod" && selectedMethod ? Number(selectedMethod.cod_fee || 0) : 0;
  const total = subtotal + tax + actualShipping + codFee;

  const handleAddAddress = async () => {
    if (!newAddress.full_name || !newAddress.address_line1 || !newAddress.city || !newAddress.state || !newAddress.postal_code) {
      toast({ title: "Missing fields", description: "Please fill in all required address fields.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({ ...newAddress, customer_id: customer.id, country: "India" })
      .select("*")
      .single();
    if (data) {
      setAddresses((prev) => [...prev, data]);
      setSelectedAddressId(data.id);
      setShowAddAddress(false);
      toast({ title: "Address added" });
    }
    if (error) toast({ title: "Failed", description: "Could not add address.", variant: "destructive" });
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      toast({ title: "Select address", description: "Please select a delivery address.", variant: "destructive" });
      return;
    }

    setPlacing(true);
    try {
      const selectedAddr = addresses.find((a) => a.id === selectedAddressId);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: customer.id,
          order_status: "pending",
          payment_status: paymentMode === "cod" ? "cod_pending" : "pending",
          fulfillment_status: "unfulfilled",
          is_cod: paymentMode === "cod",
          shipping_method_id: selectedMethodId,
          subtotal,
          tax_total: tax,
          shipping_total: actualShipping,
          cod_fee: codFee,
          grand_total: total,
          currency: "INR",
          shipping_address_snapshot: selectedAddr || {},
          name_snapshot: customer.full_name || selectedAddr?.full_name,
          email_snapshot: customer.email,
          phone_snapshot: customer.phone || selectedAddr?.phone_number,
          source_channel: "website",
        })
        .select("id, order_number")
        .single();

      if (orderError || !order) throw new Error("Failed to create order");

      await Promise.all(
        items.map((item) =>
          supabase.from("order_items").insert({
            order_id: order.id,
            product_id_snapshot: item.product_id,
            product_name_snapshot: item.product_name,
            variant_id_snapshot: item.variant_id,
            variant_name_snapshot: item.variant_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          })
        )
      );

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "order_placed",
        actor: "customer",
        notes: "Order placed by customer",
      });

      if (paymentMode === "cod") {
        await clearCart();
        toast({ title: "Order placed!", description: `Order ${order.order_number} placed successfully.` });
        setLocation(`/orders/${order.id}`);
        return;
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Payment gateway failed to load");

      const paymentRes = await apiFetch<{
        success: boolean;
        orderId: string;
        amount: number;
        currency: string;
        key: string;
      }>("/api/payment/create-order", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id, amount: total, currency: "INR", customerId: customer.id }),
      });

      if (!paymentRes.success) throw new Error("Failed to create payment");

      const win = window as unknown as Record<string, unknown>;
      const RazorpayConstructor = win["Razorpay"] as new (opts: Record<string, unknown>) => { open: () => void };

      const rzp = new RazorpayConstructor({
        key: paymentRes.key,
        amount: Math.round(total * 100),
        currency: "INR",
        name: "YA Commerce",
        description: `Order ${order.order_number}`,
        order_id: paymentRes.orderId,
        handler: async (response: Record<string, string>) => {
          try {
            await apiFetch("/api/payment/verify", {
              method: "POST",
              body: JSON.stringify({
                razorpay_order_id: response["razorpay_order_id"],
                razorpay_payment_id: response["razorpay_payment_id"],
                razorpay_signature: response["razorpay_signature"],
                orderId: order.id,
              }),
            });
            await clearCart();
            toast({ title: "Payment successful!", description: `Order ${order.order_number} confirmed.` });
            setLocation(`/orders/${order.id}`);
          } catch {
            toast({ title: "Verification failed", description: "Payment may have succeeded. Check your orders.", variant: "destructive" });
          }
        },
        prefill: {
          name: customer.full_name || "",
          email: customer.email || "",
          contact: customer.phone || "",
        },
        theme: { color: "#d97706" },
      });

      rzp.open();
    } catch (err) {
      toast({ title: "Order failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/cart" className="hover:text-amber-600">Cart</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Checkout</span>
      </nav>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Address */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><MapPin size={18} /> Delivery Address</h2>
              <button onClick={() => setShowAddAddress(!showAddAddress)} className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                <Plus size={14} /> Add New
              </button>
            </div>

            {showAddAddress && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Full Name *" value={newAddress.full_name} onChange={(e) => setNewAddress({ ...newAddress, full_name: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <input placeholder="Phone *" value={newAddress.phone_number} onChange={(e) => setNewAddress({ ...newAddress, phone_number: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <input placeholder="Address Line 1 *" value={newAddress.address_line1} onChange={(e) => setNewAddress({ ...newAddress, address_line1: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input placeholder="Address Line 2" value={newAddress.address_line2} onChange={(e) => setNewAddress({ ...newAddress, address_line2: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <div className="grid grid-cols-3 gap-3">
                  <input placeholder="City *" value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <input placeholder="State *" value={newAddress.state} onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <input placeholder="PIN Code *" value={newAddress.postal_code} onChange={(e) => setNewAddress({ ...newAddress, postal_code: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <button onClick={handleAddAddress} className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600">Save Address</button>
              </div>
            )}

            <div className="space-y-3">
              {addresses.length === 0 ? (
                <p className="text-sm text-gray-500">No saved addresses. Please add one above.</p>
              ) : (
                addresses.map((addr) => (
                  <label
                    key={addr.id as string}
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedAddressId === addr.id ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddressId === (addr.id as string)}
                      onChange={() => setSelectedAddressId(addr.id as string)}
                      className="mt-1 accent-amber-500"
                    />
                    <div>
                      <p className="font-medium text-sm text-gray-900">{addr.full_name as string}</p>
                      <p className="text-sm text-gray-600">{addr.address_line1 as string}{addr.address_line2 ? `, ${addr.address_line2}` : ""}</p>
                      <p className="text-sm text-gray-600">{addr.city as string}, {addr.state as string} - {addr.postal_code as string}</p>
                      {addr.phone_number && <p className="text-xs text-gray-500 mt-1">{addr.phone_number as string}</p>}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Shipping */}
          {shippingMethods.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4"><Truck size={18} /> Shipping Method</h2>
              <div className="space-y-3">
                {shippingMethods.map((method) => (
                  <label
                    key={method.id as string}
                    className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedMethodId === method.id ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input type="radio" name="shipping" checked={selectedMethodId === (method.id as string)} onChange={() => setSelectedMethodId(method.id as string)} className="accent-amber-500" />
                      <div>
                        <p className="font-medium text-sm text-gray-900">{method.name as string}</p>
                        {method.estimated_days_min && (
                          <p className="text-xs text-gray-500">{method.estimated_days_min as number}-{method.estimated_days_max as number} business days</p>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-sm">
                      {method.free_above_amount && subtotal >= Number(method.free_above_amount) ? "Free" : formatPrice(method.base_rate as number)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4"><CreditCard size={18} /> Payment Method</h2>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${paymentMode === "online" ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300"}`}>
                <input type="radio" name="payment" checked={paymentMode === "online"} onChange={() => setPaymentMode("online")} className="accent-amber-500" />
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-gray-600" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Pay Online</p>
                    <p className="text-xs text-gray-500">UPI, Cards, Net Banking, Wallets</p>
                  </div>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${paymentMode === "cod" ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300"}`}>
                <input type="radio" name="payment" checked={paymentMode === "cod"} onChange={() => setPaymentMode("cod")} className="accent-amber-500" />
                <div className="flex items-center gap-2">
                  <Banknote size={18} className="text-gray-600" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Cash on Delivery</p>
                    <p className="text-xs text-gray-500">Pay when your order arrives</p>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span className="text-gray-600 truncate mr-2">{item.product_name} x{item.quantity}</span>
                  <span className="flex-shrink-0">{formatPrice(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tax (GST)</span><span>{formatPrice(tax)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span>{actualShipping === 0 ? "Free" : formatPrice(actualShipping)}</span></div>
              {codFee > 0 && <div className="flex justify-between"><span className="text-gray-600">COD Fee</span><span>{formatPrice(codFee)}</span></div>}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <button
              data-testid="button-place-order"
              onClick={handlePlaceOrder}
              disabled={placing || !selectedAddressId}
              className="mt-6 w-full px-6 py-3.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {placing ? "Processing..." : paymentMode === "cod" ? "Place Order (COD)" : "Pay & Place Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
