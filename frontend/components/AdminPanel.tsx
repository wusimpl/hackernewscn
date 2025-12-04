/**
 * AdminPanel - Refactored to use modular admin components
 * 
 * This file now serves as a simple re-export of the new AdminLayout component.
 * The admin panel has been restructured into:
 * - AdminLayout: Main layout with sidebar navigation
 * - AdminLogin: Authentication screen
 * - AdminSidebar: Navigation sidebar (desktop) / tabs (mobile)
 * - DashboardTab: Status overview and quick actions
 * - SettingsTab: Scheduler configuration
 * - PromptTab: LLM prompt editor
 * - DatabaseTab: Database monitoring
 */

export { AdminLayout as AdminPanel } from './admin';
