export interface IActivities {
    srcMain: string,
    alt: string,
    title: string,
    description: {
      text: string,
      operatingDay: string,
    },
    link: {
      name: string,
      href: string
    }
}
