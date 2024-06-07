export interface IActivities {
    srcMain: string,
    alt: string,
    title: string,
    imagesCarousel: [
      string,
      string,
      string, 
    ],
    description: {
      text: string,
      operatingDay: string,
    },
    link: {
      name: string,
      href: string
    }
}