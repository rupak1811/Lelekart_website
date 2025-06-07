import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

interface ProductDetailsProps {
  product: {
    id: number;
    name: string;
    price: number;
    imageUrl: string;
    colors: string[];
    sizes: string[];
  };
  onAddToCart: (product: any, color: string, size: string) => void;
  onBuyNow?: (product: any, color: string, size: string) => void;
}

export function ProductDetails({ product, onAddToCart, onBuyNow }: ProductDetailsProps) {
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [showValidation, setShowValidation] = useState(false);
  const { toast } = useToast();

  const validateSelection = () => {
    if (!selectedColor || !selectedSize) {
      setShowValidation(true);
      toast({
        title: "Selection Required",
        description: "Please select both color and size to proceed.",
        variant: "destructive",
      });
      return false;
    }
    setShowValidation(false);
    return true;
  };

  const handleAddToCart = () => {
    if (!validateSelection()) return;
    
    onAddToCart(product, selectedColor, selectedSize);
    toast({
      title: "Added to Cart",
      description: "Product has been added to your cart.",
    });
  };

  const handleBuyNow = () => {
    if (!validateSelection()) return;
    
    if (onBuyNow) {
      onBuyNow(product, selectedColor, selectedSize);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Product Image */}
        <div>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-96 object-cover rounded-lg"
          />
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-2xl font-bold text-primary">₹{product.price}</p>

          {/* Color Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-gray-900">Color</h3>
              <span className="text-red-500">*</span>
              {showValidation && !selectedColor && (
                <div className="flex items-center text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Required
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              {product.colors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setShowValidation(false);
                  }}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    selectedColor === color
                      ? "border-primary scale-110"
                      : "border-transparent hover:border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Size Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-gray-900">Size</h3>
              <span className="text-red-500">*</span>
              {showValidation && !selectedSize && (
                <div className="flex items-center text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Required
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setSelectedSize(size);
                    setShowValidation(false);
                  }}
                  className={`px-4 py-2 border rounded-md transition-all ${
                    selectedSize === size
                      ? "border-primary bg-primary/10 text-primary scale-105"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleAddToCart}
              className="w-full"
              size="lg"
            >
              Add to Cart
            </Button>
            {onBuyNow && (
              <Button
                onClick={handleBuyNow}
                className="w-full"
                size="lg"
                variant="outline"
              >
                Buy Now
              </Button>
            )}
          </div>

          {/* Validation Message */}
          {showValidation && (!selectedColor || !selectedSize) && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">
                Please select both color and size to add product into cart.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 