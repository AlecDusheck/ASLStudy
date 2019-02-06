export interface IStudySetItem {
  image: string;
  help: string;
}

export interface IStudySet {
  items: IStudySet[];
  name: string,
  id?: string
}
