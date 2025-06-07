import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, emailService, generateOTP } from "./auth";
import { 
  sendOtpSchema, 
  verifyOtpSchema, 
  registerUserSchema,
  insertVendorSchema,
  insertProductSchema,
  insertCartItemSchema,
  insertCategorySchema
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Authentication routes
  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { email } = sendOtpSchema.parse(req.body);
      
      // Clean up expired OTPs
      await storage.cleanupExpiredOtps();
      
      // Generate OTP and set expiration (5 minutes)
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      
      // Save OTP to database
      await storage.createOtp({
        email,
        code,
        expiresAt
      });
      
      // Send OTP via email
      await emailService.sendOTP(email, code);
      
      res.json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { email, code } = verifyOtpSchema.parse(req.body);
      
      // Special handling for super admin - bypass OTP verification
      if (email === 'kaushlendra.k12@fms.edu') {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          (req.session as any).userId = existingUser.id;
          return res.json({ 
            message: "Super admin login successful", 
            user: existingUser,
            requiresRegistration: false 
          });
        }
      }
      
      // Verify OTP for regular users
      const otp = await storage.getValidOtp(email, code);
      if (!otp) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }
      
      // Mark OTP as used
      await storage.markOtpAsUsed(otp.id);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      
      if (existingUser) {
        // User exists, log them in
        (req.session as any).userId = existingUser.id;
        res.json({ 
          message: "Login successful", 
          user: existingUser,
          requiresRegistration: false 
        });
      } else {
        // New user, needs registration
        res.json({ 
          message: "OTP verified", 
          requiresRegistration: true,
          email 
        });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const userData = registerUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      
      // Create new user
      const user = await storage.createUser({
        ...userData,
        isEmailVerified: true,
        role: "buyer"
      });
      
      // Log user in
      (req.session as any).userId = user.id;
      
      res.json({ message: "Registration successful", user });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // Return user data with impersonation status
      const response = {
        ...req.user.userData,
        isImpersonating: req.user.isImpersonating || false,
        originalUser: req.user.originalUser || null
      };
      res.json(response);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Admin routes for user management and impersonation
  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user.userData;
      if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/impersonate/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user.userData;
      if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const targetUserId = parseInt(req.params.userId);
      const targetUser = await storage.impersonateUser(currentUser.id, targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }

      // Store impersonation data in session
      req.session.impersonatedUserId = targetUserId;
      req.session.originalUserId = currentUser.id;
      req.session.userId = targetUserId;

      res.json({ message: "Impersonation started successfully", targetUser });
    } catch (error) {
      console.error("Error starting impersonation:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  app.post('/api/admin/exit-impersonation', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.session.impersonatedUserId || !req.session.originalUserId) {
        return res.status(400).json({ message: "No active impersonation session" });
      }

      // Restore original user session
      req.session.userId = req.session.originalUserId;
      delete req.session.impersonatedUserId;
      delete req.session.originalUserId;

      res.json({ message: "Impersonation ended successfully" });
    } catch (error) {
      console.error("Error ending impersonation:", error);
      res.status(500).json({ message: "Failed to end impersonation" });
    }
  });

  app.patch('/api/admin/users/:userId/role', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user.userData;
      if (currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: "Only super admins can change user roles" });
      }

      const userId = parseInt(req.params.userId);
      const { role } = req.body;

      if (!['buyer', 'seller', 'admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const updatedUser = await storage.updateUserRole(userId, role);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.delete('/api/admin/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user.userData;
      if (currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: "Only super admins can delete users" });
      }

      const userId = parseInt(req.params.userId);
      
      // Prevent deleting self
      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }

      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ message: "User not found or cannot be deleted" });
      }

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Vendor routes
  app.get('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const vendors = await storage.getVendors();
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Handle owner email - find or create user
      const { ownerEmail, ...vendorFields } = req.body;
      
      if (!ownerEmail) {
        return res.status(400).json({ message: "Owner email is required" });
      }

      // Find existing user or create new one
      let ownerUser = await storage.getUserByEmail(ownerEmail);
      if (!ownerUser) {
        // Create new user with seller role
        ownerUser = await storage.createUser({
          email: ownerEmail,
          role: 'seller',
          isEmailVerified: false,
          isDeletable: true,
          createdBy: user.id
        });
      } else if (ownerUser.role !== 'seller' && ownerUser.role !== 'super_admin') {
        // Update existing user to seller role
        await storage.updateUser(ownerUser.id, { role: 'seller' });
      }

      // Create vendor with owner ID
      const vendorData = insertVendorSchema.parse({
        ...vendorFields,
        ownerId: ownerUser.id,
        createdBy: user.id
      });
      const vendor = await storage.createVendor(vendorData);
      
      res.json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.get('/api/vendors/my', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByOwner(userId);
      res.json(vendor);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ message: "Failed to fetch vendor" });
    }
  });

  // Product routes
  app.get('/api/products', async (req, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const products = await storage.getProducts(vendorId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'seller' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const productData = insertProductSchema.parse(req.body);
      
      // Verify vendor ownership for sellers
      if (user.role === 'seller') {
        const vendor = await storage.getVendorByOwner(user.id.toString());
        if (!vendor || vendor.id !== productData.vendorId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.put('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'seller' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Verify vendor ownership for sellers
      if (user.role === 'seller') {
        const vendor = await storage.getVendorByOwner(user.id.toString());
        if (!vendor || vendor.id !== product.vendorId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const updateData = insertProductSchema.partial().parse(req.body);
      const updatedProduct = await storage.updateProduct(productId, updateData);
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'seller' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Verify vendor ownership for sellers
      if (user.role === 'seller') {
        const vendor = await storage.getVendorByOwner(user.id.toString());
        if (!vendor || vendor.id !== product.vendorId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const deleted = await storage.deleteProduct(productId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Cart routes
  app.get('/api/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const cartItems = await storage.getCartItems(userId.toString());
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post('/api/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cartItemData = insertCartItemSchema.parse({
        ...req.body,
        userId
      });
      
      const cartItem = await storage.addToCart(cartItemData);
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  app.put('/api/cart/:productId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.productId);
      const { quantity } = z.object({ quantity: z.number() }).parse(req.body);
      
      const cartItem = await storage.updateCartItem(userId, productId, quantity);
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  app.delete('/api/cart/:productId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.productId);
      
      const removed = await storage.removeFromCart(userId, productId);
      res.json({ success: removed });
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Order routes
  app.get('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      let filters: any = {};
      
      if (user?.role === 'buyer') {
        filters.customerId = user.id;
      } else if (user?.role === 'seller') {
        const vendor = await storage.getVendorByOwner(user.id.toString());
        if (vendor) {
          filters.vendorId = vendor.id;
        }
      }
      // Super admin can see all orders (no filters)
      
      const orders = await storage.getOrders(filters);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { vendorId, shippingAddress } = req.body;
      
      // Get cart items
      const cartItems = await storage.getCartItems(userId);
      if (cartItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      // Calculate total
      const total = cartItems.reduce((sum, item) => 
        sum + (parseFloat(item.product.price) * item.quantity), 0
      );

      // Create order
      const orderData = {
        customerId: userId,
        vendorId: parseInt(vendorId),
        total: total.toString(),
        shippingAddress,
        status: 'pending'
      };

      const orderItems = cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.product.price
      }));

      const order = await storage.createOrder(orderData, orderItems);
      
      // Clear cart
      await storage.clearCart(userId);
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.put('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'seller' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const orderId = parseInt(req.params.id);
      const { status } = z.object({ status: z.string() }).parse(req.body);
      
      // Verify order ownership for sellers
      if (user.role === 'seller') {
        const order = await storage.getOrder(orderId);
        const vendor = await storage.getVendorByOwner(user.id.toString());
        if (!order || !vendor || order.vendorId !== vendor.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const updatedOrder = await storage.updateOrderStatus(orderId, status);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Logout route
  app.get('/api/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
      }
      res.redirect('/');
    });
  });

  // Category routes
  app.get('/api/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const isGlobal = req.query.isGlobal === 'true';

      // Super Admin can see all categories
      if (user.role === 'super_admin') {
        const categories = await storage.getCategories({ vendorId, isGlobal });
        return res.json(categories);
      }

      // Sellers can see global categories and their own vendor categories
      if (user.role === 'seller') {
        const vendor = await storage.getVendorByOwner(userId);
        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        // Get global categories and vendor-specific categories
        const [globalCategories, vendorCategories] = await Promise.all([
          storage.getCategories({ isGlobal: true }),
          storage.getCategories({ vendorId: vendor.id, isGlobal: false })
        ]);

        const allCategories = [...globalCategories, ...vendorCategories];
        return res.json(allCategories);
      }

      // Default: return empty array for other roles
      res.json([]);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const categoryData = insertCategorySchema.parse({
        ...req.body,
        createdBy: parseInt(userId)
      });

      // Super Admin can create global categories
      if (user.role === 'super_admin' && categoryData.isGlobal) {
        const category = await storage.createCategory({
          ...categoryData,
          vendorId: null,
          isGlobal: true
        });
        return res.status(201).json(category);
      }

      // Sellers can create vendor-specific categories
      if (user.role === 'seller') {
        const vendor = await storage.getVendorByOwner(userId);
        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const category = await storage.createCategory({
          ...categoryData,
          vendorId: vendor.id,
          isGlobal: false
        });
        return res.status(201).json(category);
      }

      res.status(403).json({ message: "Insufficient permissions" });
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch('/api/categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      const categoryId = parseInt(req.params.id);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const existingCategory = await storage.getCategory(categoryId);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      const updateData = insertCategorySchema.partial().parse(req.body);

      // Super Admin can update global categories
      if (user.role === 'super_admin' && existingCategory.isGlobal) {
        const category = await storage.updateCategory(categoryId, updateData);
        return res.json(category);
      }

      // Sellers can update their own vendor categories
      if (user.role === 'seller' && !existingCategory.isGlobal) {
        const vendor = await storage.getVendorByOwner(userId);
        if (!vendor || existingCategory.vendorId !== vendor.id) {
          return res.status(403).json({ message: "Cannot update this category" });
        }

        const category = await storage.updateCategory(categoryId, updateData);
        return res.json(category);
      }

      res.status(403).json({ message: "Insufficient permissions" });
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete('/api/categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      const categoryId = parseInt(req.params.id);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const existingCategory = await storage.getCategory(categoryId);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Super Admin can delete global categories
      if (user.role === 'super_admin' && existingCategory.isGlobal) {
        const deleted = await storage.deleteCategory(categoryId);
        return res.json({ success: deleted });
      }

      // Sellers can delete their own vendor categories
      if (user.role === 'seller' && !existingCategory.isGlobal) {
        const vendor = await storage.getVendorByOwner(userId);
        if (!vendor || existingCategory.vendorId !== vendor.id) {
          return res.status(403).json({ message: "Cannot delete this category" });
        }

        const deleted = await storage.deleteCategory(categoryId);
        return res.json({ success: deleted });
      }

      res.status(403).json({ message: "Insufficient permissions" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Domain Management Routes
  app.get('/api/admin/custom-domains', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const domains = await storage.getCustomDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching custom domains:", error);
      res.status(500).json({ message: "Failed to fetch custom domains" });
    }
  });

  app.post('/api/admin/custom-domains', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const domainData = {
        ...req.body,
        createdBy: parseInt(userId),
        status: 'pending' // pending, active, inactive
      };

      const domain = await storage.createCustomDomain(domainData);
      
      // Auto-update vendor with custom domain
      if (domain.vendorId) {
        await storage.updateVendor(domain.vendorId, { 
          customDomainId: domain.id 
        });
      }

      res.json(domain);
    } catch (error) {
      console.error("Error creating custom domain:", error);
      res.status(500).json({ message: "Failed to create custom domain" });
    }
  });

  app.put('/api/admin/custom-domains/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const domainId = parseInt(req.params.id);
      const domain = await storage.updateCustomDomain(domainId, req.body);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }

      res.json(domain);
    } catch (error) {
      console.error("Error updating custom domain:", error);
      res.status(500).json({ message: "Failed to update custom domain" });
    }
  });

  app.delete('/api/admin/custom-domains/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const domainId = parseInt(req.params.id);
      const deleted = await storage.deleteCustomDomain(domainId);
      
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting custom domain:", error);
      res.status(500).json({ message: "Failed to delete custom domain" });
    }
  });

  // Domain-based Storefront Route
  app.get('/api/storefront/by-domain', async (req, res) => {
    try {
      const hostname = req.headers.host || req.query.domain as string;
      
      if (!hostname) {
        return res.status(400).json({ message: "Domain not specified" });
      }

      // Remove port if present
      const domain = hostname.split(':')[0];
      
      // Try to find vendor by custom domain first
      let vendor = await storage.getVendorByDomain(domain);
      
      // If not found, check if it's a subdomain pattern
      if (!vendor && domain.includes('.')) {
        const subdomain = domain.split('.')[0];
        vendor = await storage.getVendorByDomain(subdomain);
      }

      if (!vendor) {
        return res.status(404).json({ message: "Store not found" });
      }

      // Get vendor's products and categories
      const [products, categories] = await Promise.all([
        storage.getProducts(vendor.id),
        storage.getCategories({ vendorId: vendor.id })
      ]);

      res.json({
        vendor: {
          id: vendor.id,
          name: vendor.name,
          description: vendor.description,
          domain: vendor.domain,
          customDomain: vendor.customDomainId ? domain : null
        },
        products,
        categories
      });
    } catch (error) {
      console.error("Error fetching storefront data:", error);
      res.status(500).json({ message: "Failed to load storefront" });
    }
  });

  // Auto-generate subdomain for new vendors
  app.post('/api/admin/vendors/:id/generate-subdomain', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const vendorId = parseInt(req.params.id);
      const vendor = await storage.getVendor(vendorId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      // Generate subdomain from vendor name
      const subdomain = vendor.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // Update vendor with generated subdomain
      const updatedVendor = await storage.updateVendor(vendorId, { 
        domain: `${subdomain}.${process.env.REPLIT_DOMAINS || 'yourdomain.com'}` 
      });

      res.json(updatedVendor);
    } catch (error) {
      console.error("Error generating subdomain:", error);
      res.status(500).json({ message: "Failed to generate subdomain" });
    }
  });

  // Order status update endpoint
  app.put('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(parseInt(userId));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const orderId = parseInt(req.params.id);
      const { status } = req.body;

      // Validate status
      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid order status" });
      }

      // Super admins can update any order, sellers can only update their own orders
      if (user.role === 'super_admin' || user.role === 'admin') {
        const updatedOrder = await storage.updateOrderStatus(orderId, status);
        if (!updatedOrder) {
          return res.status(404).json({ message: "Order not found" });
        }
        res.json(updatedOrder);
      } else if (user.role === 'seller') {
        // Check if order belongs to seller's vendor
        const order = await storage.getOrder(orderId);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        const vendor = await storage.getVendorByOwner(userId);
        if (!vendor || order.vendorId !== vendor.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        const updatedOrder = await storage.updateOrderStatus(orderId, status);
        res.json(updatedOrder);
      } else {
        return res.status(403).json({ message: "Access denied" });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
