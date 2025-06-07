import { useQuery } from "@tanstack/react-query";

export interface User {
  id: number;
  email: string;
  role: 'super_admin' | 'seller' | 'buyer';
  name: string;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
