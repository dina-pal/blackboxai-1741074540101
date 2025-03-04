'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface Breadcrumb {
  label: string;
  path: string;
  icon?: string;
  isActive?: boolean;
}

interface BreadcrumbConfig {
  [key: string]: {
    label: string;
    icon?: string;
    dynamic?: boolean;
    getDynamicLabel?: (param: string) => Promise<string> | string;
  };
}

interface UseBreadcrumbsOptions {
  config: BreadcrumbConfig;
  separator?: string;
  rootLabel?: string;
  rootPath?: string;
  maxItems?: number;
  onBreadcrumbClick?: (breadcrumb: Breadcrumb) => void;
  transformLabel?: (label: string) => string;
}

export function useBreadcrumbs({
  config,
  separator = '/',
  rootLabel = 'Home',
  rootPath = '/',
  maxItems = 0,
  onBreadcrumbClick,
  transformLabel,
}: UseBreadcrumbsOptions) {
  const pathname = usePathname();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate breadcrumbs based on current path
  const generateBreadcrumbs = useCallback(async () => {
    setIsLoading(true);
    try {
      const pathSegments = pathname
        .split('/')
        .filter(segment => segment !== '');

      const newBreadcrumbs: Breadcrumb[] = [
        {
          label: rootLabel,
          path: rootPath,
          isActive: pathname === rootPath,
        },
      ];

      let currentPath = '';
      for (const segment of pathSegments) {
        currentPath += `/${segment}`;
        
        // Check if this is a configured path
        const configKey = Object.keys(config).find(key => {
          if (config[key].dynamic) {
            const pattern = new RegExp(
              `^${key.replace(/:\w+/g, '([^/]+)')}$`
            );
            return pattern.test(currentPath);
          }
          return key === currentPath;
        });

        if (configKey) {
          const configItem = config[configKey];
          let label = configItem.label;

          // Handle dynamic segments
          if (configItem.dynamic && configItem.getDynamicLabel) {
            const param = segment;
            const dynamicLabel = await configItem.getDynamicLabel(param);
            label = dynamicLabel;
          }

          // Transform label if needed
          if (transformLabel) {
            label = transformLabel(label);
          }

          newBreadcrumbs.push({
            label,
            path: currentPath,
            icon: configItem.icon,
            isActive: currentPath === pathname,
          });
        }
      }

      // Apply max items limit if specified
      const finalBreadcrumbs = maxItems > 0
        ? newBreadcrumbs.slice(-maxItems)
        : newBreadcrumbs;

      setBreadcrumbs(finalBreadcrumbs);
    } catch (error) {
      console.error('Error generating breadcrumbs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [
    pathname,
    config,
    rootLabel,
    rootPath,
    maxItems,
    transformLabel,
  ]);

  // Update breadcrumbs when path changes
  useEffect(() => {
    generateBreadcrumbs();
  }, [generateBreadcrumbs]);

  // Handle breadcrumb click
  const handleClick = useCallback((breadcrumb: Breadcrumb) => {
    onBreadcrumbClick?.(breadcrumb);
  }, [onBreadcrumbClick]);

  // Get formatted path for display
  const getFormattedPath = useCallback((includeRoot = true) => {
    return breadcrumbs
      .slice(includeRoot ? 0 : 1)
      .map(b => b.label)
      .join(` ${separator} `);
  }, [breadcrumbs, separator]);

  // Get current page title
  const getCurrentPageTitle = useCallback(() => {
    return breadcrumbs[breadcrumbs.length - 1]?.label || '';
  }, [breadcrumbs]);

  // Check if current path is root
  const isRootPath = useCallback(() => {
    return pathname === rootPath;
  }, [pathname, rootPath]);

  // Get parent breadcrumb
  const getParentBreadcrumb = useCallback(() => {
    return breadcrumbs[breadcrumbs.length - 2] || null;
  }, [breadcrumbs]);

  // Get breadcrumb by path
  const getBreadcrumbByPath = useCallback((path: string) => {
    return breadcrumbs.find(b => b.path === path) || null;
  }, [breadcrumbs]);

  // Get breadcrumb index
  const getBreadcrumbIndex = useCallback((path: string) => {
    return breadcrumbs.findIndex(b => b.path === path);
  }, [breadcrumbs]);

  // Get breadcrumb level
  const getBreadcrumbLevel = useCallback((path: string) => {
    const index = getBreadcrumbIndex(path);
    return index === -1 ? -1 : index + 1;
  }, [getBreadcrumbIndex]);

  // Get breadcrumbs up to path
  const getBreadcrumbsUpToPath = useCallback((path: string) => {
    const index = getBreadcrumbIndex(path);
    return index === -1 ? [] : breadcrumbs.slice(0, index + 1);
  }, [breadcrumbs, getBreadcrumbIndex]);

  // Check if path is in breadcrumb trail
  const isInBreadcrumbTrail = useCallback((path: string) => {
    return getBreadcrumbIndex(path) !== -1;
  }, [getBreadcrumbIndex]);

  return {
    breadcrumbs,
    isLoading,
    separator,
    handleClick,
    getFormattedPath,
    getCurrentPageTitle,
    isRootPath,
    getParentBreadcrumb,
    getBreadcrumbByPath,
    getBreadcrumbIndex,
    getBreadcrumbLevel,
    getBreadcrumbsUpToPath,
    isInBreadcrumbTrail,
  };
}

// Helper hook for dynamic breadcrumb labels
export function useDynamicBreadcrumb(
  param: string,
  fetchLabel: (param: string) => Promise<string>
) {
  const [label, setLabel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadLabel = async () => {
      setIsLoading(true);
      try {
        const newLabel = await fetchLabel(param);
        setLabel(newLabel);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch label'));
      } finally {
        setIsLoading(false);
      }
    };

    loadLabel();
  }, [param, fetchLabel]);

  return { label, isLoading, error };
}

// Helper hook for breadcrumb history
export function useBreadcrumbHistory(maxHistory = 10) {
  const [history, setHistory] = useState<Breadcrumb[]>([]);

  const addToHistory = useCallback((breadcrumb: Breadcrumb) => {
    setHistory(prev => {
      const filtered = prev.filter(b => b.path !== breadcrumb.path);
      return [breadcrumb, ...filtered].slice(0, maxHistory);
    });
  }, [maxHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addToHistory,
    clearHistory,
  };
}
