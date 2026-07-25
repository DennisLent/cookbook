// Collection context used to group recipes into user-defined saved sets.

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import React from "react";
import { apiRequest } from "@/lib/api";

export type Collection = {
  id: string;
  name: string;
  recipeIds: string[];
};

type CollectionsContextType = {
  collections: Collection[];
  createCollection: (name: string) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  addToCollection: (collectionId: string, recipeId: string) => void;
  removeFromCollection: (collectionId: string, recipeId: string) => void;
  getCollectionsForRecipe: (recipeId: string) => Collection[];
  isInCollection: (collectionId: string, recipeId: string) => boolean;
};

const CollectionsContext = React.createContext<CollectionsContextType | undefined>(undefined);

type BackendCollection = {
  id: string;
  name: string;
  recipeIds: string[];
};

function normalizeCollection(collection: BackendCollection): Collection {
  return {
    id: String(collection.id),
    name: collection.name,
    recipeIds: (collection.recipeIds || []).map((id) => String(id)),
  };
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    apiRequest<BackendCollection[]>("/collections/")
      .then((data) => setCollections(data.map(normalizeCollection)))
      .catch(() => setCollections([]));
  }, []);

  const createCollection = (name: string) => {
    apiRequest<BackendCollection>("/collections/", {
      method: "POST",
      body: JSON.stringify({ name, recipeIds: [] }),
    })
      .then((created) => setCollections((prev) => [...prev, normalizeCollection(created)]))
      .catch(() => undefined);
  };

  const deleteCollection = (id: string) => {
    apiRequest(`/collections/${id}/`, { method: "DELETE" })
      .then(() => setCollections((prev) => prev.filter((collection) => collection.id !== id)))
      .catch(() => undefined);
  };

  const renameCollection = (id: string, name: string) => {
    const current = collections.find((collection) => collection.id === id);
    if (!current) return;
    apiRequest<BackendCollection>(`/collections/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    })
      .then((updated) => {
        setCollections((prev) =>
          prev.map((collection) => (collection.id === id ? normalizeCollection(updated) : collection)),
        );
      })
      .catch(() => undefined);
  };

  const addToCollection = (collectionId: string, recipeId: string) => {
    const current = collections.find((collection) => collection.id === collectionId);
    if (!current || current.recipeIds.includes(recipeId)) return;
    apiRequest<BackendCollection>(`/collections/${collectionId}/recipes/${recipeId}/`, {
      method: "POST",
    })
      .then((updated) => {
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === collectionId ? normalizeCollection(updated) : collection,
          ),
        );
      })
      .catch(() => undefined);
  };

  const removeFromCollection = (collectionId: string, recipeId: string) => {
    const current = collections.find((collection) => collection.id === collectionId);
    if (!current) return;
    apiRequest<BackendCollection>(`/collections/${collectionId}/recipes/${recipeId}/`, {
      method: "DELETE",
    })
      .then((updated) => {
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === collectionId ? normalizeCollection(updated) : collection,
          ),
        );
      })
      .catch(() => undefined);
  };

  const getCollectionsForRecipe = (recipeId: string) => {
    return collections.filter((collection) => collection.recipeIds.includes(recipeId));
  };

  const isInCollection = (collectionId: string, recipeId: string) => {
    const collection = collections.find((entry) => entry.id === collectionId);
    return collection ? collection.recipeIds.includes(recipeId) : false;
  };

  return React.createElement(
    CollectionsContext.Provider,
    {
      value: {
        collections,
        createCollection,
        deleteCollection,
        renameCollection,
        addToCollection,
        removeFromCollection,
        getCollectionsForRecipe,
        isInCollection,
      },
    },
    children,
  );
}

export function useCollections() {
  const context = useContext(CollectionsContext);
  if (!context) throw new Error("useCollections must be used within CollectionsProvider");
  return context;
}
