import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface CartItem {
  id: number;
  productId: number;
  name: string;
  price: number;
  imageUrl: string;
  color: string;
  size: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  mergeGuestCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "lelekart_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        // Validate cart data structure
        if (Array.isArray(parsedCart) && parsedCart.every(validateCartItem)) {
          setItems(parsedCart);
        } else {
          console.error("Invalid cart data structure");
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load cart from localStorage:", error);
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save cart to localStorage:", error);
      toast({
        title: "Error",
        description: "Failed to save cart data. Please try again.",
        variant: "destructive",
      });
    }
  }, [items, toast]);

  // Merge guest cart with user cart after login
  useEffect(() => {
    if (isAuthenticated && user) {
      mergeGuestCart();
    }
  }, [isAuthenticated, user]);

  const validateCartItem = (item: any): item is CartItem => {
    return (
      typeof item === "object" &&
      typeof item.id === "number" &&
      typeof item.productId === "number" &&
      typeof item.name === "string" &&
      typeof item.price === "number" &&
      typeof item.imageUrl === "string" &&
      typeof item.color === "string" &&
      typeof item.size === "string" &&
      typeof item.quantity === "number"
    );
  };

  const addItem = (item: Omit<CartItem, "id">) => {
    setItems((currentItems) => {
      // Check if item with same product, color, and size exists
      const existingItemIndex = currentItems.findIndex(
        (i) =>
          i.productId === item.productId &&
          i.color === item.color &&
          i.size === item.size
      );

      if (existingItemIndex > -1) {
        // Update quantity if item exists
        const newItems = [...currentItems];
        newItems[existingItemIndex].quantity += item.quantity;
        return newItems;
      }

      // Add new item if it doesn't exist
      return [
        ...currentItems,
        {
          ...item,
          id: Date.now(), // Generate unique ID
        },
      ];
    });

    toast({
      title: "Added to Cart",
      description: "Product has been added to your cart.",
    });
  };

  const removeItem = (id: number) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );

    toast({
      title: "Removed from Cart",
      description: "Item has been removed from your cart.",
    });
  };

  const updateQuantity = (id: number, quantity: number) => {
    if (quantity < 1) {
      removeItem(id);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  };

  const mergeGuestCart = () => {
    // This function would typically make an API call to merge the guest cart with the user's cart
    // For now, we'll just keep the guest cart in localStorage
    toast({
      title: "Cart Updated",
      description: "Your cart has been updated with your previous selections.",
    });
  };

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        mergeGuestCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
} 