export declare type PlainObject = {
  [key: string]: any;
};
export declare type ObjectStore = {
  [key: string]: PlainObject;
};
export declare type ObjectMap = {
  hierarchy: PlainObject;
  objects: ObjectStore;
};
export declare const reconstituteData: (
  { hierarchy, objects }: ObjectMap,
  orphanIds?: string[] | null
) => PlainObject;
export default reconstituteData;
