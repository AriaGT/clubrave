"use client";

import type { ApiComponents } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type Employee = ApiComponents["schemas"]["Employee"];
export type EmployeeCreateBody = ApiComponents["schemas"]["EmployeeCreate"];
export type EmployeeUpdateBody = ApiComponents["schemas"]["PatchedEmployeeUpdate"];

const KEY = ["employees"];

export function useEmployees() {
  const api = useApi();
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/employees/");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEmployee() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: EmployeeCreateBody) => {
      const { data, error } = await api.POST("/api/org/employees/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateEmployee() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: EmployeeUpdateBody }) => {
      const { data, error } = await api.PATCH("/api/org/employees/{id}/", { params: { path: { id } }, body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResetEmployeePassword() {
  const api = useApi();
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const { error } = await api.POST("/api/org/employees/{id}/reset-password/", {
        params: { path: { id } },
        body: { password },
      });
      if (error) throw error;
    },
  });
}

export function useDeleteEmployee() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/org/employees/{id}/", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
