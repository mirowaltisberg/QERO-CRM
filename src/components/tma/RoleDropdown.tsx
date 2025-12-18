"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TmaRole } from "@/lib/types";
import { ROLE_COLOR_SWATCHES } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

interface RoleDropdownProps {
  value: string | null;
  roles: TmaRole[];
  loading?: boolean;
  onSelect: (roleName: string | null) => void;
  onCreateRole: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onUpdateRole: (id: string, payload: Partial<Pick<TmaRole, "name" | "color" | "note">>) => Promise<TmaRole>;
  onDeleteRole: (id: string) => Promise<void>;
  onRefreshRoles: () => Promise<void>;
}

export function RoleDropdown({
  value,
  roles,
  loading,
  onSelect,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onRefreshRoles,
}: RoleDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState<string>(ROLE_COLOR_SWATCHES[0]);
  const [creatingRole, setCreatingRole] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const normalizedValue = (value ?? "").trim().toLowerCase();
  const selectedRole = useMemo(
    () => roles.find((role) => role.name.trim().toLowerCase() === normalizedValue) || null,
    [roles, normalizedValue]
  );

  // Calculate dropdown position when opening
  const updateDropdownPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
  }, []);

  const handleDocumentClick = useCallback(
    (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node;
      // Check if click is inside button or dropdown
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setShowCreateForm(false);
      setSearchQuery("");
    },
    [open]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick]);

  // Update position when dropdown opens
  useEffect(() => {
    if (open) {
      updateDropdownPosition();
    }
  }, [open, updateDropdownPosition]);

  // Focus search input when dropdown opens and is positioned
  useEffect(() => {
    if (open && dropdownPos) {
      // Delay to ensure portal is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, dropdownPos]);

  const clearSelection = useCallback(() => {
    onSelect(null);
    setOpen(false);
    setSearchQuery("");
  }, [onSelect]);

  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim()) return;
    setCreatingRole(true);
    try {
      const role = await onCreateRole({ name: newRoleName.trim(), color: newRoleColor });
      onSelect(role.name);
      setNewRoleName("");
      setShowCreateForm(false);
      setOpen(false);
      setSearchQuery("");
    } catch (error) {
      // Error already surfaced via hook-level setError
    } finally {
      setCreatingRole(false);
    }
  }, [newRoleName, newRoleColor, onCreateRole, onSelect]);

  const roleList = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles]
  );

  // Filter roles based on search query
  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roleList;
    const query = searchQuery.toLowerCase().trim();
    return roleList.filter((role) => role.name.toLowerCase().includes(query));
  }, [roleList, searchQuery]);

  const portalRoot = mounted ? document.body : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
          selectedRole
            ? "border-gray-300 text-gray-900"
            : "border-dashed border-gray-300 text-gray-500",
          loading && "opacity-60"
        )}
        disabled={loading}
      >
        <span className="flex items-center gap-2">
          {selectedRole ? (
            <>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: selectedRole.color }}
              />
              <span className="font-medium">{selectedRole.name}</span>
            </>
          ) : (
            "Select role"
          )}
        </span>
        <svg
          className={cn("h-4 w-4 text-gray-400 transition", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && portalRoot && dropdownPos && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {/* Search input */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rolle suchen..."
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {roleList.length === 0 && !showCreateForm && (
              <p className="px-4 py-3 text-sm text-gray-500">No roles yet. Create one below.</p>
            )}
            {filteredRoles.length === 0 && roleList.length > 0 && (
              <p className="px-4 py-3 text-sm text-gray-500">Keine Rollen gefunden</p>
            )}
            {filteredRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  onSelect(role.name);
                  setOpen(false);
                  setSearchQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50",
                  selectedRole?.id === role.id && "bg-gray-100"
                )}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: role.color }}
                />
                <span className="flex-1 text-gray-900 whitespace-nowrap">{role.name}</span>
                {role.note && (
                  <span className="text-xs text-gray-500 truncate max-w-[80px]">{role.note}</span>
                )}
              </button>
            ))}
          </div>

          {showCreateForm ? (
            <div className="border-t border-gray-100 px-4 py-3">
              <p className="text-xs font-medium uppercase text-gray-400">New role</p>
              <Input
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder="Role name"
                className="mt-2"
              />
              <ColorSwatches
                className="mt-3"
                value={newRoleColor}
                onChange={setNewRoleColor}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={handleCreateRole} disabled={creatingRole || !newRoleName.trim()}>
                  {creatingRole ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRoleName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => setShowCreateForm(true)}
              >
                + New role
              </Button>
              {selectedRole && (
                <Button variant="ghost" size="sm" className="w-full" onClick={clearSelection}>
                  Clear role
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setManagerOpen(true);
                  setOpen(false);
                }}
              >
                Edit roles
              </Button>
            </div>
          )}
        </div>,
        portalRoot
      )}

      <RoleManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        roles={roles}
        onCreateRole={onCreateRole}
        onUpdateRole={onUpdateRole}
        onDeleteRole={onDeleteRole}
        onRefreshRoles={onRefreshRoles}
      />
    </div>
  );
}

interface RoleManagerModalProps {
  open: boolean;
  onClose: () => void;
  roles: TmaRole[];
  onCreateRole: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onUpdateRole: (id: string, payload: Partial<Pick<TmaRole, "name" | "color" | "note">>) => Promise<TmaRole>;
  onDeleteRole: (id: string) => Promise<void>;
  onRefreshRoles: () => Promise<void>;
}

function RoleManagerModal({
  open,
  onClose,
  roles,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onRefreshRoles,
}: RoleManagerModalProps) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; color: string; note: string }>({
    name: "",
    color: ROLE_COLOR_SWATCHES[0],
    note: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; color: string; note: string }>({
    name: "",
    color: ROLE_COLOR_SWATCHES[0],
    note: "",
  });

  useEffect(() => {
    if (!open) {
      setForm({ name: "", color: ROLE_COLOR_SWATCHES[0], note: "" });
      setEditingId(null);
    }
  }, [open]);

  const startEdit = (role: TmaRole) => {
    setEditingId(role.id);
    setEditDraft({
      name: role.name,
      color: role.color,
      note: role.note ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await onUpdateRole(editingId, {
        name: editDraft.name.trim(),
        color: editDraft.color,
        note: editDraft.note.trim() ? editDraft.note.trim() : null,
      });
      setEditingId(null);
    } catch {
      // errors handled upstream
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await onCreateRole({
        name: form.name.trim(),
        color: form.color,
        note: form.note.trim() ? form.note.trim() : null,
      });
      setForm({ name: "", color: ROLE_COLOR_SWATCHES[0], note: "" });
    } catch {
      // errors handled upstream
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (role: TmaRole) => {
    const confirmDelete = window.confirm(`Delete role “${role.name}”? This cannot be undone.`);
    if (!confirmDelete) return;
    try {
      await onDeleteRole(role.id);
      await onRefreshRoles();
    } catch {
      // errors handled upstream
    }
  };

  const roleList = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles]
  );

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-gray-900">Manage roles</h2>
          <p className="text-sm text-gray-500">
            Create, edit, or remove tags. Notes appear as tooltips in the selector.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase text-gray-400">Add new role</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Role name"
            />
            <Input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Optional note"
            />
          </div>
          <ColorSwatches
            className="mt-3"
            value={form.color}
            onChange={(color) => setForm((prev) => ({ ...prev, color }))}
          />
          <Button
            className="mt-3"
            size="sm"
            onClick={handleCreate}
            disabled={creating || !form.name.trim()}
          >
            {creating ? "Saving…" : "Add role"}
          </Button>
        </section>

        <section className="space-y-3">
          {roleList.length === 0 ? (
            <p className="text-sm text-gray-500">No roles yet.</p>
          ) : (
            roleList.map((role) => (
              <div
                key={role.id}
                className="rounded-2xl border border-gray-200 p-4"
              >
                {editingId === role.id ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={editDraft.name}
                        onChange={(event) =>
                          setEditDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <Textarea
                        value={editDraft.note}
                        onChange={(event) =>
                          setEditDraft((prev) => ({ ...prev, note: event.target.value }))
                        }
                        placeholder="Optional note"
                        rows={2}
                      />
                    </div>
                    <ColorSwatches
                      value={editDraft.color}
                      onChange={(color) => setEditDraft((prev) => ({ ...prev, color }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        <p className="font-medium text-gray-900">{role.name}</p>
                      </div>
                      {role.note && (
                        <p className="mt-1 text-sm text-gray-500">{role.note}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(role)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(role)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </Modal>
  );
}

interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

function ColorSwatches({ value, onChange, className }: ColorSwatchesProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {ROLE_COLOR_SWATCHES.map((color) => (
        <button
          type="button"
          key={color}
          onClick={() => onChange(color)}
          className={cn(
            "h-6 w-6 rounded-full border-2 transition",
            value === color ? "border-gray-900" : "border-transparent"
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}

