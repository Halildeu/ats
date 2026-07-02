/* Block marketplace types */

export interface BlockMeta {
  /** Unique block identifier (kebab-case). */
  id: string;
  /** Display name. */
  name: string;
  /** Category for browsing. */
  category: 'dashboard' | 'crud' | 'admin' | 'review' | 'form' | 'layout';
  /** Short description. */
  description: string;
  /** Design-system components used by this block. */
  components: string[];
  /** Tags for search. */
  tags: string[];
}

export interface BlockRegistry {
  version: string;
  blocks: BlockMeta[];
}
