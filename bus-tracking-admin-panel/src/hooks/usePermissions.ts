'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

type Permission = string;
type Role = string;
type Resource = string;
type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | string;

interface PermissionRule {
  role: Role;
  resource: Resource;
  actions: Action[];
  conditions?: Record<string, any>;
}

interface UsePermissionsOptions {
  initialRoles?: Role[];
  rules?: PermissionRule[];
  cacheKey?: string;
  onPermissionDenied?: (permission: Permission) => void;
  validateConditions?: (conditions: Record<string, any>) => boolean;
}

interface PermissionCheck {
  granted: boolean;
  reason?: string;
}

export function usePermissions({
  initialRoles = [],
  rules = [],
  cacheKey = 'user-permissions',
  onPermissionDenied,
  validateConditions,
}: UsePermissionsOptions = {}) {
  const [roles, setRoles] = useLocalStorage<Role[]>(cacheKey, initialRoles);
  const [permissionCache] = useState<Map<string, boolean>>(new Map());

  // Check if user has a specific role
  const hasRole = useCallback((role: Role): boolean => {
    return roles.includes(role);
  }, [roles]);

  // Add role to user
  const addRole = useCallback((role: Role) => {
    setRoles(prev => [...new Set([...prev, role])]);
    permissionCache.clear(); // Clear cache when roles change
  }, [setRoles]);

  // Remove role from user
  const removeRole = useCallback((role: Role) => {
    setRoles(prev => prev.filter(r => r !== role));
    permissionCache.clear(); // Clear cache when roles change
  }, [setRoles]);

  // Set user roles
  const setUserRoles = useCallback((newRoles: Role[]) => {
    setRoles([...new Set(newRoles)]);
    permissionCache.clear(); // Clear cache when roles change
  }, [setRoles]);

  // Check if user has permission for an action on a resource
  const checkPermission = useCallback((
    resource: Resource,
    action: Action,
    context: Record<string, any> = {}
  ): PermissionCheck => {
    const cacheKey = `${resource}:${action}:${JSON.stringify(context)}`;
    
    // Check cache first
    if (permissionCache.has(cacheKey)) {
      return { granted: permissionCache.get(cacheKey)! };
    }

    // Find matching rules
    const matchingRules = rules.filter(rule => 
      roles.includes(rule.role) &&
      rule.resource === resource &&
      (rule.actions.includes(action) || rule.actions.includes('manage'))
    );

    if (matchingRules.length === 0) {
      return { granted: false, reason: 'No matching permission rules' };
    }

    // Check conditions if they exist
    for (const rule of matchingRules) {
      if (rule.conditions) {
        if (!validateConditions) {
          console.warn('Conditions present but no validateConditions function provided');
          continue;
        }

        const conditionsValid = validateConditions({
          ...rule.conditions,
          ...context,
        });

        if (!conditionsValid) {
          continue;
        }
      }

      // Cache and return result
      permissionCache.set(cacheKey, true);
      return { granted: true };
    }

    // Cache and return result
    permissionCache.set(cacheKey, false);
    return { granted: false, reason: 'Conditions not met' };
  }, [roles, rules, validateConditions]);

  // Check multiple permissions at once
  const checkPermissions = useCallback((
    checks: Array<{ resource: Resource; action: Action; context?: Record<string, any> }>
  ): boolean => {
    return checks.every(({ resource, action, context }) =>
      checkPermission(resource, action, context).granted
    );
  }, [checkPermission]);

  // Higher-order function to wrap components with permission check
  const withPermission = useCallback(<P extends object>(
    Component: React.ComponentType<P>,
    resource: Resource,
    action: Action,
    fallback?: React.ReactNode
  ) => {
    return (props: P) => {
      const { granted } = checkPermission(resource, action);
      if (!granted) {
        onPermissionDenied?.(`${resource}:${action}`);
        return fallback || null;
      }
      return <Component {...props} />;
    };
  }, [checkPermission, onPermissionDenied]);

  // Get all permissions for current roles
  const getAllPermissions = useCallback((): Array<{
    resource: Resource;
    actions: Action[];
  }> => {
    const permissions = new Map<Resource, Set<Action>>();

    rules
      .filter(rule => roles.includes(rule.role))
      .forEach(rule => {
        if (!permissions.has(rule.resource)) {
          permissions.set(rule.resource, new Set());
        }
        rule.actions.forEach(action =>
          permissions.get(rule.resource)!.add(action)
        );
      });

    return Array.from(permissions.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }));
  }, [roles, rules]);

  // Get all resources user has access to
  const getAccessibleResources = useCallback((): Resource[] => {
    return [...new Set(
      rules
        .filter(rule => roles.includes(rule.role))
        .map(rule => rule.resource)
    )];
  }, [roles, rules]);

  // Get all actions user can perform on a resource
  const getResourceActions = useCallback((resource: Resource): Action[] => {
    return [...new Set(
      rules
        .filter(rule => 
          roles.includes(rule.role) && 
          rule.resource === resource
        )
        .flatMap(rule => rule.actions)
    )];
  }, [roles, rules]);

  return {
    roles,
    hasRole,
    addRole,
    removeRole,
    setUserRoles,
    checkPermission,
    checkPermissions,
    withPermission,
    getAllPermissions,
    getAccessibleResources,
    getResourceActions,
  };
}

// Helper hook for role-based components
export function useRoleBasedRender(roles: Role[] = []) {
  const { hasRole } = usePermissions({ initialRoles: roles });

  const RoleBasedComponent = useCallback(({
    roles: requiredRoles,
    children,
    fallback = null,
  }: {
    roles: Role[];
    children: React.ReactNode;
    fallback?: React.ReactNode;
  }) => {
    const hasAccess = requiredRoles.some(hasRole);
    return hasAccess ? <>{children}</> : <>{fallback}</>;
  }, [hasRole]);

  return { RoleBasedComponent };
}

// Helper hook for permission-based routing
export function usePermissionBasedRouting(
  routes: Array<{
    path: string;
    resource: Resource;
    action: Action;
  }>
) {
  const { checkPermission } = usePermissions();

  const canAccess = useCallback((path: string) => {
    const route = routes.find(r => r.path === path);
    if (!route) return true; // No permission requirements specified
    return checkPermission(route.resource, route.action).granted;
  }, [routes, checkPermission]);

  const getAccessibleRoutes = useCallback(() => {
    return routes.filter(route =>
      checkPermission(route.resource, route.action).granted
    );
  }, [routes, checkPermission]);

  return {
    canAccess,
    getAccessibleRoutes,
  };
}
