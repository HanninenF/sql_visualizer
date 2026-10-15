# SQL Visualizer

A browser tool for drawing SQL table diagrams. Arrows connect foreign-key columns directly to the columns they reference, making relationships and JOINs easy to follow.

[Open SQL Visualizer](https://trangius.se/sql_visualizer/)

![SQL Visualizer in light mode](docs/screenshots/light.png)

- Write tables in a simple text format or MariaDB SQL; the diagram updates as you type.
- Drag tables to arrange them, or use auto layout.
- Export diagrams as SVG or PNG, and schemas as MariaDB SQL.
- Keep multiple diagrams in tabs, with light and dark themes.

Diagrams are stored by the local Node server in `data/sqlviz.sqlite`, so they
survive clearing browser cookies, history and website data. The server also
keeps the ten latest database backups in `data/backups/`.

## Simple syntax

```text
Owner
  Id
  Name

Dog
  Id
  Name
  OwnerId -> Owner.Id
```

Indent columns under each table. `Id` is an integer primary key; columns without a type default to `varchar(128)`. The **Syntax** button in the app has the full reference.

### Table data

Add explicit rows with an `@data` block. Values follow the column order and are separated with commas:

```text
Dog
  Id int
  Name vc

  @data
    1, Fredrik
    2, Bamse
```

The **Data** view displays these rows. Tables without an `@data` block are shown empty.

## Run locally

Start the app with Node.js 22.5 or newer:

```powershell
npm start
```

Then open `http://127.0.0.1:5500`. The app stores durable data in
`data/sqlviz.sqlite` and requires Node.js 22.5 or newer. Do not use Live Server
for SQLite-backed mode; it only serves static files and cannot provide the
storage API. Export a copy of the database before moving or deleting the
project folder.

![SQL Visualizer in dark mode](docs/screenshots/dark.png)
