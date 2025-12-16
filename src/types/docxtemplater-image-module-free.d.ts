declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage: (tagValue: string, tagName: string) => Buffer | string;
    getSize: (img: Buffer | string, tagValue: string, tagName: string) => [number, number];
  }

  class ImageModule {
    constructor(options: ImageModuleOptions);
  }

  export default ImageModule;
}
