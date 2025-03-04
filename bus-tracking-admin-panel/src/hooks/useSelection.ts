'use client';

import { useState, useCallback, useMemo } from 'react';

interface UseSelectionOptions<T> {
  initialSelected?: string[];
  idField?: keyof T;
  allowMultiple?: boolean;
  maxSelected?: number;
  onSelectionChange?: (selectedIds: string[]) => void;
}

interface UseSelectionReturn<T> {
  selectedIds: string[];
  selectedItems: T[];
  isSelected: (id: string) => boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  toggleSelection: (id: string) => void;
  toggleAll: () => void;
  selectRange: (startId: string, endId: string) => void;
  clearSelection: () => void;
  selectItems: (ids: string[]) => void;
  getSelectedCount: () => number;
  canSelect: (id: string) => boolean;
}

export function useSelection<T extends Record<string, any>>(
  items: T[],
  {
    initialSelected = [],
    idField = 'id' as keyof T,
    allowMultiple = true,
    maxSelected,
    onSelectionChange,
  }: UseSelectionOptions<T> = {}
): UseSelectionReturn<T> {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);

  // Get all available IDs
  const allIds = useMemo(() => 
    items.map(item => String(item[idField])),
    [items, idField]
  );

  // Get selected items
  const selectedItems = useMemo(() => 
    items.filter(item => selectedIds.includes(String(item[idField]))),
    [items, selectedIds, idField]
  );

  // Check if an item is selected
  const isSelected = useCallback((id: string) => 
    selectedIds.includes(id),
    [selectedIds]
  );

  // Check if all items are selected
  const isAllSelected = useMemo(() => 
    allIds.length > 0 && allIds.every(id => selectedIds.includes(id)),
    [allIds, selectedIds]
  );

  // Check if some but not all items are selected
  const isIndeterminate = useMemo(() => 
    !isAllSelected && selectedIds.length > 0,
    [isAllSelected, selectedIds]
  );

  // Check if more items can be selected
  const canSelect = useCallback((id: string) => {
    if (!allowMultiple) {
      return selectedIds.length === 0 || selectedIds.includes(id);
    }
    if (maxSelected !== undefined && !selectedIds.includes(id)) {
      return selectedIds.length < maxSelected;
    }
    return true;
  }, [allowMultiple, maxSelected, selectedIds]);

  // Update selection
  const updateSelection = useCallback((newSelection: string[]) => {
    setSelectedIds(newSelection);
    onSelectionChange?.(newSelection);
  }, [onSelectionChange]);

  // Toggle selection of a single item
  const toggleSelection = useCallback((id: string) => {
    if (!canSelect(id)) return;

    updateSelection(
      selectedIds.includes(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : allowMultiple
          ? [...selectedIds, id]
          : [id]
    );
  }, [selectedIds, allowMultiple, canSelect, updateSelection]);

  // Toggle selection of all items
  const toggleAll = useCallback(() => {
    if (!allowMultiple) return;

    updateSelection(isAllSelected ? [] : allIds);
  }, [allowMultiple, isAllSelected, allIds, updateSelection]);

  // Select a range of items (shift + click functionality)
  const selectRange = useCallback((startId: string, endId: string) => {
    if (!allowMultiple) return;

    const startIndex = allIds.indexOf(startId);
    const endIndex = allIds.indexOf(endId);
    
    if (startIndex === -1 || endIndex === -1) return;

    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    
    const rangeIds = allIds.slice(start, end + 1);
    
    // Filter range based on maxSelected if needed
    const newSelection = maxSelected !== undefined
      ? rangeIds.slice(0, maxSelected - selectedIds.length)
      : rangeIds;

    updateSelection([...new Set([...selectedIds, ...newSelection])]);
  }, [allowMultiple, allIds, maxSelected, selectedIds, updateSelection]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    updateSelection([]);
  }, [updateSelection]);

  // Select specific items
  const selectItems = useCallback((ids: string[]) => {
    if (!allowMultiple) {
      updateSelection(ids.slice(0, 1));
      return;
    }

    const validIds = ids.filter(id => allIds.includes(id));
    const newSelection = maxSelected !== undefined
      ? validIds.slice(0, maxSelected)
      : validIds;

    updateSelection(newSelection);
  }, [allowMultiple, allIds, maxSelected, updateSelection]);

  // Get count of selected items
  const getSelectedCount = useCallback(() => 
    selectedIds.length,
    [selectedIds]
  );

  return {
    selectedIds,
    selectedItems,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggleSelection,
    toggleAll,
    selectRange,
    clearSelection,
    selectItems,
    getSelectedCount,
    canSelect,
  };
}

// Helper hook for managing row selection in tables
export function useTableSelection<T extends Record<string, any>>(
  rows: T[],
  options?: UseSelectionOptions<T>
) {
  const selection = useSelection(rows, options);

  const getRowProps = useCallback((id: string) => ({
    onClick: (e: React.MouseEvent) => {
      if (e.shiftKey) {
        selection.selectRange(selection.selectedIds[0], id);
      } else {
        selection.toggleSelection(id);
      }
    },
    'aria-selected': selection.isSelected(id),
    className: selection.isSelected(id) ? 'selected' : undefined,
  }), [selection]);

  const getHeaderProps = useCallback(() => ({
    onClick: selection.toggleAll,
    'aria-checked': selection.isAllSelected,
    'data-indeterminate': selection.isIndeterminate,
  }), [selection]);

  return {
    ...selection,
    getRowProps,
    getHeaderProps,
  };
}

// Helper hook for managing list item selection
export function useListSelection<T extends Record<string, any>>(
  items: T[],
  options?: UseSelectionOptions<T>
) {
  const selection = useSelection(items, options);

  const getItemProps = useCallback((id: string) => ({
    role: 'option',
    onClick: () => selection.toggleSelection(id),
    'aria-selected': selection.isSelected(id),
    className: selection.isSelected(id) ? 'selected' : undefined,
  }), [selection]);

  return {
    ...selection,
    getItemProps,
  };
}
