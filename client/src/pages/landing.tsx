import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { ShoppingCart } from "@/components/shopping-cart";
import { useCart } from "@/lib/cart-context";
import { ProductDetails } from "@/components/product-details";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  colors: string[];
  sizes: string[];
}

// Sample product data
const sampleProducts: Product[] = [
  {
    id: 1,
    name: "Classic White T-Shirt",
    price: 999,
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop",
    colors: ["White", "Black", "Gray"],
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: 2,
    name: "Slim Fit Jeans",
    price: 1999,
    imageUrl: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&h=600&fit=crop",
    colors: ["Blue", "Black"],
    sizes: ["28", "30", "32", "34"]
  },
  {
    id: 3,
    name: "Casual Sneakers",
    price: 2499,
    imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=600&fit=crop",
    colors: ["White", "Black", "Red"],
    sizes: ["7", "8", "9", "10"]
  },
  {
    id: 4,
    name: "Leather Jacket",
    price: 4999,
    imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&h=600&fit=crop",
    colors: ["Brown", "Black"],
    sizes: ["S", "M", "L"]
  }
];

export default function Landing() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { addItem, items, itemCount } = useCart();

  const handleLogin = () => {
    window.location.href = "/login";
  };

  const handleAddToCart = (product: Product, color: string, size: string) => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      color,
      size,
      quantity: 1
    });
    setSelectedProduct(null);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-primary">Lelekart</h1>
              <nav className="hidden md:flex space-x-6">
                <a href="#" className="text-gray-600 hover:text-primary">Home</a>
                <a href="#" className="text-gray-600 hover:text-primary">Shop</a>
                <a href="#" className="text-gray-600 hover:text-primary">Categories</a>
                <a href="#" className="text-gray-600 hover:text-primary">Deals</a>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-gray-600 hover:text-primary"
              >
                <i className="fas fa-shopping-cart text-xl"></i>
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </button>
              <Button onClick={handleLogin} variant="outline">
                Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Discover Amazing Products
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Shop the latest trends with unbeatable prices and fast delivery.
              </p>
              <Button size="lg" className="bg-primary hover:bg-primary/90">
                Shop Now
              </Button>
            </div>
            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=600&fit=crop"
                alt="Shopping"
                className="rounded-lg shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Shop by Category
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {['Electronics', 'Fashion', 'Home', 'Beauty'].map((category) => (
              <Card key={category} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-tag text-primary text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold">{category}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Featured Products
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {sampleProducts.map((product) => (
              <Card key={product.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <img 
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                  <h3 className="font-semibold mb-2">{product.name}</h3>
                  <p className="text-primary font-bold mb-4">₹{product.price}</p>
                  <Button 
                    className="w-full"
                    onClick={() => setSelectedProduct(product)}
                  >
                    Add to Cart
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Product Details Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl">
          {selectedProduct && (
            <ProductDetails
              product={selectedProduct}
              onAddToCart={handleAddToCart}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Shopping Cart Modal */}
      <ShoppingCart 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={() => window.location.href = "/checkout"}
        cartItems={items}
        refetchCart={() => {}}
      />
    </div>
  );
}
